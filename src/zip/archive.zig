const std = @import("std");
const deflate = @import("../compression/raw_deflate.zig");

pub const Options = struct {
    max_entries: usize = 65_535,
    max_entry_bytes: usize = 64 * 1024 * 1024,
};

pub const Entry = struct {
    name: []const u8,
    method: u16,
    flags: u16,
    crc32: u32,
    uncompressed_size: usize,
    compressed: []const u8,
};

pub const Archive = struct {
    allocator: std.mem.Allocator,
    entries: []Entry,

    pub fn deinit(self: *Archive) void {
        self.allocator.free(self.entries);
        self.* = undefined;
    }

    pub fn find(self: Archive, name: []const u8) ?Entry {
        for (self.entries) |entry| {
            if (std.mem.eql(u8, entry.name, name)) return entry;
        }
        return null;
    }

    /// The returned bytes are owned by the caller. CRC and exact output length
    /// are verified before any content is handed to the HWPX layer.
    pub fn decode(self: Archive, entry: Entry, max_bytes: usize) ![]u8 {
        const bound = @min(max_bytes, entry.uncompressed_size);
        if (entry.uncompressed_size > bound) return error.LimitExceeded;
        const out = switch (entry.method) {
            0 => try self.allocator.dupe(u8, entry.compressed),
            8 => try deflate.decode(self.allocator, entry.compressed, bound),
            else => return error.UnsupportedCompression,
        };
        errdefer self.allocator.free(out);
        if (out.len != entry.uncompressed_size) return error.InvalidUncompressedSize;
        if (std.hash.Crc32.hash(out) != entry.crc32) return error.InvalidCrc;
        return out;
    }
};

fn u16le(bytes: []const u8, offset: usize) u16 {
    return std.mem.readInt(u16, bytes[offset..][0..2], .little);
}

fn u32le(bytes: []const u8, offset: usize) u32 {
    return std.mem.readInt(u32, bytes[offset..][0..4], .little);
}

fn checkedSlice(bytes: []const u8, start: usize, len: usize) ![]const u8 {
    if (start > bytes.len or len > bytes.len - start) return error.TruncatedZip;
    return bytes[start .. start + len];
}

fn validName(name: []const u8) bool {
    if (name.len == 0 or name[0] == '/') return false;
    var part_start: usize = 0;
    for (name, 0..) |c, i| {
        if (c == 0 or c == '\\') return false;
        if (c == '/') {
            if (i == part_start or std.mem.eql(u8, name[part_start..i], "..")) return false;
            part_start = i + 1;
        }
    }
    return part_start == name.len or
        (part_start < name.len and !std.mem.eql(u8, name[part_start..], ".."));
}

const Range = struct {
    start: usize,
    end: usize,
};

fn rangeLess(_: void, lhs: Range, rhs: Range) bool {
    return lhs.start < rhs.start;
}

pub fn open(allocator: std.mem.Allocator, bytes: []const u8, options: Options) !Archive {
    // EOCD is 22 bytes plus at most 65535 bytes of comment. Require its
    // comment to end at EOF; a stray PK\x05\x06 inside payload is not enough.
    if (bytes.len < 22) return error.MissingEndRecord;
    const floor = bytes.len - @min(bytes.len, 22 + 65_535);
    var cursor = bytes.len - 22;
    var end: ?usize = null;
    var fallback: ?usize = null;
    while (true) {
        if (u32le(bytes, cursor) == 0x06054b50 and
            @as(usize, u16le(bytes, cursor + 20)) == bytes.len - (cursor + 22))
        {
            if (fallback == null) fallback = cursor;
            // A comment may itself contain a complete-looking EOCD. Its
            // directory extent must point immediately before this candidate.
            const candidate_start: usize = u32le(bytes, cursor + 16);
            const candidate_size: usize = u32le(bytes, cursor + 12);
            if (candidate_start == 0xffffffff or candidate_size == 0xffffffff or
                (candidate_start <= cursor and candidate_size == cursor - candidate_start))
            {
                end = cursor;
                break;
            }
        }
        if (cursor == floor) break;
        cursor -= 1;
    }
    const eocd = end orelse fallback orelse return error.MissingEndRecord;
    const count: usize = u16le(bytes, eocd + 10);
    const cd_size: usize = u32le(bytes, eocd + 12);
    const cd_start: usize = u32le(bytes, eocd + 16);
    if (count == 0xffff or cd_size == 0xffffffff or cd_start == 0xffffffff)
        return error.UnsupportedZip64;
    if (u16le(bytes, eocd + 4) != 0 or u16le(bytes, eocd + 6) != 0 or
        u16le(bytes, eocd + 8) != count) return error.UnsupportedMultiDisk;
    if (count > options.max_entries) return error.LimitExceeded;
    if (cd_start > eocd or cd_size > eocd - cd_start or cd_start + cd_size != eocd)
        return error.InvalidCentralDirectory;

    const entries = try allocator.alloc(Entry, count);
    errdefer allocator.free(entries);
    const local_ranges = try allocator.alloc(Range, count);
    defer allocator.free(local_ranges);
    var seen: std.StringHashMapUnmanaged(void) = .empty;
    defer seen.deinit(allocator);
    cursor = cd_start;
    for (entries, local_ranges) |*entry, *local_range| {
        const header = try checkedSlice(bytes, cursor, 46);
        if (u32le(header, 0) != 0x02014b50) return error.InvalidCentralDirectory;
        const flags = u16le(header, 8);
        if (flags & 1 != 0) return error.UnsupportedEncryption;
        const method = u16le(header, 10);
        if (method != 0 and method != 8) return error.UnsupportedCompression;
        const crc = u32le(header, 16);
        const compressed_size: usize = u32le(header, 20);
        const uncompressed_size: usize = u32le(header, 24);
        const name_len: usize = u16le(header, 28);
        const extra_len: usize = u16le(header, 30);
        const comment_len: usize = u16le(header, 32);
        const disk = u16le(header, 34);
        const local_offset: usize = u32le(header, 42);
        if (compressed_size == 0xffffffff or uncompressed_size == 0xffffffff or
            local_offset == 0xffffffff or disk == 0xffff) return error.UnsupportedZip64;
        if (disk != 0) return error.UnsupportedMultiDisk;
        if (uncompressed_size > options.max_entry_bytes) return error.LimitExceeded;
        if (method == 0 and compressed_size != uncompressed_size) return error.InvalidStoredSize;
        const rest_len = try std.math.add(usize, name_len, extra_len);
        const total_len = try std.math.add(usize, rest_len, comment_len);
        const rest = try checkedSlice(bytes, cursor + 46, total_len);
        const name = rest[0..name_len];
        if (!validName(name)) return error.InvalidEntryName;
        if ((try seen.getOrPut(allocator, name)).found_existing) return error.DuplicateEntryName;
        if (local_offset >= cd_start) return error.InvalidLocalHeader;
        const local = try checkedSlice(bytes[0..cd_start], local_offset, 30);
        if (u32le(local, 0) != 0x04034b50 or u16le(local, 6) != flags or
            u16le(local, 8) != method or u16le(local, 26) != name_len)
            return error.InvalidLocalHeader;
        const local_extra_len: usize = u16le(local, 28);
        const local_name = try checkedSlice(bytes[0..cd_start], local_offset + 30, name_len);
        if (!std.mem.eql(u8, name, local_name)) return error.LocalNameMismatch;
        if (flags & 8 == 0 and (u32le(local, 14) != crc or
            u32le(local, 18) != compressed_size or u32le(local, 22) != uncompressed_size))
            return error.LocalMetadataMismatch;
        const data_offset = try std.math.add(usize, local_offset + 30 + name_len, local_extra_len);
        const compressed = try checkedSlice(bytes[0..cd_start], data_offset, compressed_size);
        var data_end = data_offset + compressed_size;
        if (flags & 8 != 0) {
            // Bit 3 makes central sizes authoritative, but the trailing
            // descriptor must still agree. CRC itself can equal the optional
            // signature, so try the unsigned layout before the signed one.
            const descriptor = try checkedSlice(bytes[0..cd_start], data_end, 12);
            if (u32le(descriptor, 0) == crc and
                u32le(descriptor, 4) == compressed_size and
                u32le(descriptor, 8) == uncompressed_size)
            {
                data_end += 12;
            } else {
                if (u32le(descriptor, 0) != 0x08074b50) return error.InvalidDataDescriptor;
                const signed = try checkedSlice(bytes[0..cd_start], data_end + 4, 12);
                if (u32le(signed, 0) != crc or
                    u32le(signed, 4) != compressed_size or
                    u32le(signed, 8) != uncompressed_size)
                    return error.InvalidDataDescriptor;
                data_end += 16;
            }
        }
        local_range.* = .{ .start = local_offset, .end = data_end };
        entry.* = .{
            .name = name,
            .flags = flags,
            .method = method,
            .crc32 = crc,
            .compressed = compressed,
            .uncompressed_size = uncompressed_size,
        };
        cursor += 46 + total_len;
    }
    if (cursor != eocd) return error.InvalidCentralDirectory;
    std.mem.sort(Range, local_ranges, {}, rangeLess);
    if (local_ranges.len > 1) {
        for (1..local_ranges.len) |i| {
            if (local_ranges[i].start < local_ranges[i - 1].end) return error.OverlappingLocalEntries;
        }
    }
    return .{ .allocator = allocator, .entries = entries };
}

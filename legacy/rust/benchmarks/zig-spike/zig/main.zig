const std = @import("std");

const Allocator = std.mem.Allocator;
const EndOfChain: u32 = 0xfffffffe;
const NoStream: u32 = 0xffffffff;
const FatSector: u32 = 0xfffffffd;
const DifSector: u32 = 0xfffffffc;

const ProbeError = error{
    InvalidSignature,
    InvalidHeader,
    InvalidSector,
    InvalidChain,
    InvalidDirectory,
    StreamNotFound,
    InvalidRecord,
    DecompressionFailed,
    UnsupportedEncrypted,
    UnsupportedDistribution,
};

const Stream = struct {
    name: [64]u8 = undefined,
    name_len: usize = 0,
    object_type: u8 = 0,
    start_sector: u32 = EndOfChain,
    size: u64 = 0,

    fn nameSlice(self: *const Stream) []const u8 {
        return self.name[0..self.name_len];
    }
};

const ProbeResult = struct {
    stream_count: usize,
    stream_bytes: u64,
    version: u32,
    flags: u32,
    docinfo_records: usize,
    section_records: usize,
    checksum: u64,
};

fn u16le(data: []const u8, offset: usize) ProbeError!u16 {
    if (offset + 2 > data.len) return error.InvalidHeader;
    return std.mem.readInt(u16, data[offset..][0..2], .little);
}

fn u32le(data: []const u8, offset: usize) ProbeError!u32 {
    if (offset + 4 > data.len) return error.InvalidHeader;
    return std.mem.readInt(u32, data[offset..][0..4], .little);
}

fn u64le(data: []const u8, offset: usize) ProbeError!u64 {
    if (offset + 8 > data.len) return error.InvalidHeader;
    return std.mem.readInt(u64, data[offset..][0..8], .little);
}

fn sector(data: []const u8, sector_size: usize, sector_id: u32) ProbeError![]const u8 {
    if (sector_id == EndOfChain or sector_id == NoStream or sector_id == FatSector or sector_id == DifSector) {
        return error.InvalidSector;
    }
    const id = @as(usize, @intCast(sector_id));
    if (id > (data.len / sector_size)) return error.InvalidSector;
    const start = (id + 1) * sector_size;
    if (start > data.len or data.len - start < sector_size) return error.InvalidSector;
    return data[start .. start + sector_size];
}

fn readRegularChain(
    data: []const u8,
    sector_size: usize,
    fat: []const u32,
    start_sector: u32,
    allocator: Allocator,
    expected_size: ?usize,
) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    var current = start_sector;
    var steps: usize = 0;

    while (current != EndOfChain and current != NoStream) {
        if (steps >= fat.len) return error.InvalidChain;
        if (@as(usize, @intCast(current)) >= fat.len) return error.InvalidChain;
        const chunk = try sector(data, sector_size, current);
        try bytes.appendSlice(allocator, chunk);
        current = fat[@as(usize, @intCast(current))];
        steps += 1;
    }

    const owned = try bytes.toOwnedSlice(allocator);
    if (expected_size) |size| {
        if (size > owned.len) return error.InvalidChain;
        return owned[0..size];
    }
    return owned;
}

fn readMiniChain(
    mini_stream: []const u8,
    mini_sector_size: usize,
    mini_fat: []const u32,
    start_sector: u32,
    size: usize,
    allocator: Allocator,
) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    var current = start_sector;
    var steps: usize = 0;

    while (current != EndOfChain and current != NoStream) {
        if (steps >= mini_fat.len) return error.InvalidChain;
        const id = @as(usize, @intCast(current));
        if (id >= mini_fat.len) return error.InvalidChain;
        const start = id * mini_sector_size;
        if (start > mini_stream.len or mini_stream.len - start < mini_sector_size) {
            return error.InvalidChain;
        }
        try bytes.appendSlice(allocator, mini_stream[start .. start + mini_sector_size]);
        current = mini_fat[id];
        steps += 1;
    }

    const owned = try bytes.toOwnedSlice(allocator);
    if (size > owned.len) return error.InvalidChain;
    return owned[0..size];
}

const Cfb = struct {
    data: []const u8,
    allocator: Allocator,
    sector_size: usize,
    mini_sector_size: usize,
    mini_cutoff: u64,
    fat: []u32,
    mini_fat: []u32,
    streams: []Stream,
    root_start_sector: u32,
    root_size: usize,

    fn parse(data: []const u8, allocator: Allocator) !Cfb {
        if (data.len < 512 or !std.mem.eql(u8, data[0..8], &[_]u8{
            0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
        })) return error.InvalidSignature;

        const sector_shift = try u16le(data, 0x1e);
        const mini_sector_shift = try u16le(data, 0x20);
        if (sector_shift < 9 or sector_shift > 16 or mini_sector_shift < 3 or mini_sector_shift > 12) {
            return error.InvalidHeader;
        }
        const sector_size = @as(usize, 1) << @as(u6, @intCast(sector_shift));
        const mini_sector_size = @as(usize, 1) << @as(u6, @intCast(mini_sector_shift));
        const fat_sector_count = try u32le(data, 0x2c);
        const first_directory_sector = try u32le(data, 0x30);
        const mini_cutoff = @as(u64, try u32le(data, 0x38));
        const first_mini_fat_sector = try u32le(data, 0x3c);
        const mini_fat_sector_count = try u32le(data, 0x40);
        const first_difat_sector = try u32le(data, 0x44);
        const difat_sector_count = try u32le(data, 0x48);

        var fat_sector_ids: std.ArrayList(u32) = .empty;
        defer fat_sector_ids.deinit(allocator);
        for (0..109) |i| {
            const id = try u32le(data, 0x4c + i * 4);
            if (id != NoStream) try fat_sector_ids.append(allocator, id);
        }

        var difat_sector = first_difat_sector;
        var difat_steps: usize = 0;
        while (difat_steps < difat_sector_count) : (difat_steps += 1) {
            const difat = try sector(data, sector_size, difat_sector);
            for (0..(sector_size / 4 - 1)) |i| {
                const id = std.mem.readInt(u32, difat[i * 4 ..][0..4], .little);
                if (id != NoStream) try fat_sector_ids.append(allocator, id);
            }
            difat_sector = std.mem.readInt(u32, difat[sector_size - 4 ..][0..4], .little);
            if (difat_sector == EndOfChain) break;
        }
        if (fat_sector_ids.items.len < fat_sector_count) return error.InvalidHeader;

        var fat_list: std.ArrayList(u32) = .empty;
        defer fat_list.deinit(allocator);
        for (fat_sector_ids.items[0..@as(usize, @intCast(fat_sector_count))]) |id| {
            const fat_sector = try sector(data, sector_size, id);
            for (0..(sector_size / 4)) |i| {
                try fat_list.append(allocator, std.mem.readInt(u32, fat_sector[i * 4 ..][0..4], .little));
            }
        }
        const fat = try fat_list.toOwnedSlice(allocator);

        const directory = try readRegularChain(
            data,
            sector_size,
            fat,
            first_directory_sector,
            allocator,
            null,
        );
        var streams_list: std.ArrayList(Stream) = .empty;
        defer streams_list.deinit(allocator);
        var root_start_sector: u32 = EndOfChain;
        var root_size: usize = 0;

        var offset: usize = 0;
        while (offset + 128 <= directory.len) : (offset += 128) {
            const name_size = try u16le(directory, offset + 64);
            const object_type = directory[offset + 66];
            if (name_size == 0 or object_type == 0) continue;
            if (name_size > 64 or name_size % 2 != 0) return error.InvalidDirectory;

            var entry: Stream = .{};
            const character_count = @min(@as(usize, name_size / 2) - 1, entry.name.len);
            for (0..character_count) |i| {
                const code_unit = try u16le(directory, offset + i * 2);
                entry.name[i] = if (code_unit <= 0x7f) @as(u8, @intCast(code_unit)) else '?';
            }
            entry.name_len = character_count;
            entry.object_type = object_type;
            entry.start_sector = try u32le(directory, offset + 116);
            entry.size = try u64le(directory, offset + 120);

            if (object_type == 5) {
                root_start_sector = entry.start_sector;
                root_size = @as(usize, @intCast(@min(entry.size, @as(u64, std.math.maxInt(usize)))));
            } else if (object_type == 2) {
                try streams_list.append(allocator, entry);
            }
        }
        const streams = try streams_list.toOwnedSlice(allocator);

        var mini_fat: []u32 = &.{};
        if (mini_fat_sector_count != 0 and first_mini_fat_sector != EndOfChain) {
            mini_fat = try readU32Chain(data, sector_size, fat, first_mini_fat_sector, allocator);
        }

        return .{
            .data = data,
            .allocator = allocator,
            .sector_size = sector_size,
            .mini_sector_size = mini_sector_size,
            .mini_cutoff = mini_cutoff,
            .fat = fat,
            .mini_fat = mini_fat,
            .streams = streams,
            .root_start_sector = root_start_sector,
            .root_size = root_size,
        };
    }

    fn find(self: *const Cfb, name: []const u8) ?*const Stream {
        for (self.streams) |*stream_entry| {
            if (std.mem.eql(u8, stream_entry.nameSlice(), name)) return stream_entry;
        }
        return null;
    }

    fn readStream(self: *const Cfb, entry: *const Stream) ![]u8 {
        if (entry.size > std.math.maxInt(usize)) return error.InvalidChain;
        const size = @as(usize, @intCast(entry.size));
        if (entry.size < self.mini_cutoff and self.mini_fat.len != 0) {
            const mini_stream = try readRegularChain(
                self.data,
                self.sector_size,
                self.fat,
                self.root_start_sector,
                self.allocator,
                self.root_size,
            );
            return readMiniChain(
                mini_stream,
                self.mini_sector_size,
                self.mini_fat,
                entry.start_sector,
                size,
                self.allocator,
            );
        }
        return readRegularChain(
            self.data,
            self.sector_size,
            self.fat,
            entry.start_sector,
            self.allocator,
            size,
        );
    }
};

fn readU32Chain(
    data: []const u8,
    sector_size: usize,
    fat: []const u32,
    start_sector: u32,
    allocator: Allocator,
) ![]u32 {
    var values: std.ArrayList(u32) = .empty;
    var current = start_sector;
    var steps: usize = 0;
    while (current != EndOfChain and current != NoStream) {
        if (steps >= fat.len) return error.InvalidChain;
        if (@as(usize, @intCast(current)) >= fat.len) return error.InvalidChain;
        const chunk = try sector(data, sector_size, current);
        for (0..(sector_size / 4)) |i| {
            try values.append(allocator, std.mem.readInt(u32, chunk[i * 4 ..][0..4], .little));
        }
        current = fat[@as(usize, @intCast(current))];
        steps += 1;
    }
    return values.toOwnedSlice(allocator);
}

fn inflateRaw(data: []const u8, allocator: Allocator) ![]u8 {
    var input: std.Io.Reader = .fixed(data);
    var history: [std.compress.flate.max_window_len]u8 = undefined;
    var decompress = std.compress.flate.Decompress.init(&input, .raw, &history);
    var output: std.Io.Writer.Allocating = .init(allocator);
    _ = decompress.reader.streamRemaining(&output.writer) catch return error.DecompressionFailed;
    return output.toOwnedSlice() catch return error.DecompressionFailed;
}

fn scanRecords(data: []const u8) !struct { count: usize, checksum: u64 } {
    var offset: usize = 0;
    var count: usize = 0;
    var checksum: u64 = 0;
    while (offset < data.len) {
        if (data.len - offset < 4) return error.InvalidRecord;
        const dword = try u32le(data, offset);
        const tag_id = dword & 0x3ff;
        const level = (dword >> 10) & 0x3ff;
        const short_size = dword >> 20;
        var header_size: usize = 4;
        var payload_size: u32 = short_size;
        if (short_size == 0xfff) {
            payload_size = try u32le(data, offset + 4);
            header_size = 8;
        }
        if (header_size > data.len - offset) return error.InvalidRecord;
        const payload = @as(usize, @intCast(payload_size));
        if (payload > data.len - offset - header_size) return error.InvalidRecord;
        checksum = checksum *% 33 +% tag_id +% level +% payload_size;
        count += 1;
        offset += header_size + payload;
    }
    return .{ .count = count, .checksum = checksum };
}

fn probe(data: []const u8, parent_allocator: Allocator) !ProbeResult {
    var arena = std.heap.ArenaAllocator.init(parent_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const cfb = try Cfb.parse(data, allocator);
    var stream_count: usize = cfb.streams.len;
    var stream_bytes: u64 = 0;
    for (cfb.streams) |entry| {
        stream_bytes += entry.size;
    }

    const file_header_entry = cfb.find("FileHeader") orelse return error.StreamNotFound;
    const file_header = try cfb.readStream(file_header_entry);
    if (file_header.len < 49 or !std.mem.eql(u8, file_header[0..17], "HWP Document File")) {
        return error.InvalidHeader;
    }
    const version = try u32le(file_header, 32);
    const flags = try u32le(file_header, 36);
    if ((flags & 2) != 0) return error.UnsupportedEncrypted;
    if ((flags & 4) != 0) return error.UnsupportedDistribution;
    const compressed = (flags & 1) != 0;

    const docinfo_entry = cfb.find("DocInfo") orelse return error.StreamNotFound;
    const docinfo_raw = try cfb.readStream(docinfo_entry);
    const docinfo = if (compressed) try inflateRaw(docinfo_raw, allocator) else docinfo_raw;
    const doc_scan = try scanRecords(docinfo);

    var section_records: usize = 0;
    var section_checksum: u64 = 0;
    if (cfb.find("Section0")) |section_entry| {
        const section_raw = try cfb.readStream(section_entry);
        const section = if (compressed) try inflateRaw(section_raw, allocator) else section_raw;
        const section_scan = try scanRecords(section);
        section_records = section_scan.count;
        section_checksum = section_scan.checksum;
    }

    stream_count = cfb.streams.len;
    return .{
        .stream_count = stream_count,
        .stream_bytes = stream_bytes,
        .version = version,
        .flags = flags,
        .docinfo_records = doc_scan.count,
        .section_records = section_records,
        .checksum = doc_scan.checksum ^ section_checksum,
    };
}

pub fn main(init: std.process.Init) !void {
    const args = try init.minimal.args.toSlice(init.arena.allocator());
    if (args.len < 2) {
        std.debug.print("usage: hwp5-probe <file> [iterations]\n", .{});
        return error.InvalidArguments;
    }
    const iterations: usize = if (args.len >= 3)
        try std.fmt.parseUnsigned(usize, args[2], 10)
    else
        1;
    if (iterations == 0) return error.InvalidArguments;

    const data = try std.Io.Dir.cwd().readFileAlloc(
        init.io,
        args[1],
        init.gpa,
        .limited(256 * 1024 * 1024),
    );
    defer init.gpa.free(data);

    const warmup = try probe(data, init.gpa);
    var checksum: u64 = 0;
    for (0..iterations) |_| {
        const result = try probe(data, init.gpa);
        checksum +%= result.stream_count;
        checksum +%= result.stream_bytes;
        checksum +%= result.version;
        checksum +%= result.flags;
        checksum +%= result.docinfo_records;
        checksum +%= result.section_records;
        checksum +%= result.checksum;
    }
    std.debug.print(
        "probe_fields streams={} stream_bytes={} version={} flags={} docinfo_records={} section_records={} probe_checksum={}\n",
        .{ warmup.stream_count, warmup.stream_bytes, warmup.version, warmup.flags, warmup.docinfo_records, warmup.section_records, warmup.checksum },
    );
    std.debug.print(
        "mode=probe file={s} iterations={} checksum={} warmup_checksum={}\n",
        .{ args[1], iterations, checksum, warmup.checksum },
    );
}

test "scanRecords handles a short record header" {
    var data = [_]u8{0} ** 6;
    const header = (@as(u32, 2) << 20) | (@as(u32, 3) << 10) | 17;
    std.mem.writeInt(u32, data[0..4], header, .little);
    data[4] = 0xaa;
    data[5] = 0xbb;

    const result = try scanRecords(&data);
    try std.testing.expectEqual(@as(usize, 1), result.count);
}

test "scanRecords handles an extended record size" {
    var data = [_]u8{0} ** 12;
    const header = (@as(u32, 0xfff) << 20) | 23;
    std.mem.writeInt(u32, data[0..4], header, .little);
    std.mem.writeInt(u32, data[4..8], 4, .little);
    data[8] = 1;
    data[9] = 2;
    data[10] = 3;
    data[11] = 4;

    const result = try scanRecords(&data);
    try std.testing.expectEqual(@as(usize, 1), result.count);
}

test "scanRecords rejects a truncated payload" {
    var data = [_]u8{0} ** 5;
    const header = (@as(u32, 2) << 20) | 17;
    std.mem.writeInt(u32, data[0..4], header, .little);

    try std.testing.expectError(error.InvalidRecord, scanRecords(&data));
}

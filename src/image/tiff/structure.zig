const std = @import("std");

pub const ByteOrder = enum { little, big };

pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    max_ifds: usize = 1024,
    max_fields: usize = 1_000_000,
    max_data_blocks: usize = 100_000,
};

pub const Report = struct {
    byte_order: ByteOrder,
    ifds: usize = 0,
    fields: usize = 0,
    unknown_types: usize = 0,
    strips: usize = 0,
    tiles: usize = 0,
    first_compression: ?u32 = null,
    /// Image samples and compression streams are not decoded here.
    pixels_deferred: bool = true,
};

const Field = struct {
    type_id: u16,
    count: u32,
    values: ?[]const u8,
};

fn u16At(bytes: []const u8, order: ByteOrder) u16 {
    return switch (order) {
        .little => std.mem.readInt(u16, bytes[0..2], .little),
        .big => std.mem.readInt(u16, bytes[0..2], .big),
    };
}

fn u32At(bytes: []const u8, order: ByteOrder) u32 {
    return switch (order) {
        .little => std.mem.readInt(u32, bytes[0..4], .little),
        .big => std.mem.readInt(u32, bytes[0..4], .big),
    };
}

fn typeWidth(type_id: u16) ?usize {
    return switch (type_id) {
        1, 2, 6, 7 => 1,
        3, 8 => 2,
        4, 9, 11 => 4,
        5, 10, 12 => 8,
        else => null,
    };
}

fn field(bytes: []const u8, entry: []const u8, order: ByteOrder) !Field {
    const type_id = u16At(entry[2..4], order);
    const count = u32At(entry[4..8], order);
    const width = typeWidth(type_id) orelse return .{ .type_id = type_id, .count = count, .values = null };
    const size = std.math.mul(usize, @as(usize, count), width) catch return error.InvalidTiffFieldExtent;
    if (size <= 4) return .{ .type_id = type_id, .count = count, .values = entry[8 .. 8 + size] };
    const offset = u32At(entry[8..12], order);
    if (offset % 2 != 0 or offset > bytes.len or size > bytes.len - offset) return error.InvalidTiffFieldExtent;
    return .{ .type_id = type_id, .count = count, .values = bytes[offset .. offset + size] };
}

fn unsignedAt(value: Field, index: usize, order: ByteOrder) !usize {
    if (index >= value.count) return error.InvalidTiffDataCount;
    const bytes = value.values orelse return error.UnsupportedTiffDataType;
    return switch (value.type_id) {
        1 => bytes[index],
        3 => u16At(bytes[index * 2 ..], order),
        4 => u32At(bytes[index * 4 ..], order),
        else => error.UnsupportedTiffDataType,
    };
}

fn checkDataBlocks(bytes: []const u8, order: ByteOrder, offsets: ?Field, lengths: ?Field, max_blocks: usize) !usize {
    if (offsets == null and lengths == null) return 0;
    const starts = offsets orelse return error.MissingTiffDataOffsets;
    const sizes = lengths orelse return error.MissingTiffDataByteCounts;
    if (starts.count == 0 or starts.count != sizes.count) return error.InvalidTiffDataCount;
    if (starts.count > max_blocks) return error.LimitExceeded;
    for (0..starts.count) |index| {
        const start = try unsignedAt(starts, index, order);
        const size = try unsignedAt(sizes, index, order);
        if (start > bytes.len or size > bytes.len - start) return error.InvalidTiffDataExtent;
    }
    return starts.count;
}

/// Checks classic TIFF 6.0 header, IFD chain, known field extents, and
/// declared strip/tile ranges. Unknown field types are counted, not guessed.
pub fn inspect(bytes: []const u8, options: Options) !Report {
    if (bytes.len > options.max_bytes) return error.LimitExceeded;
    if (@as(u64, bytes.len) > (@as(u64, 1) << 32)) return error.LimitExceeded;
    if (bytes.len < 8) return error.TruncatedTiffHeader;
    const order: ByteOrder = if (std.mem.eql(u8, bytes[0..2], "II")) .little else if (std.mem.eql(u8, bytes[0..2], "MM")) .big else return error.InvalidTiffByteOrder;
    if (u16At(bytes[2..4], order) != 42) return error.UnsupportedTiffVersion;
    var offset = u32At(bytes[4..8], order);
    if (offset == 0) return error.MissingTiffIfd;
    var seen: [1024]u32 = undefined;
    var report: Report = .{ .byte_order = order };
    while (offset != 0) {
        if (report.ifds >= @min(options.max_ifds, seen.len)) return error.LimitExceeded;
        for (seen[0..report.ifds]) |earlier| if (earlier == offset) return error.TiffIfdCycle;
        seen[report.ifds] = offset;
        report.ifds += 1;
        if (offset < 8 or offset % 2 != 0 or offset > bytes.len or bytes.len - offset < 2) return error.InvalidTiffIfdOffset;
        const count = u16At(bytes[offset..][0..2], order);
        if (count == 0) return error.EmptyTiffIfd;
        if (count > options.max_fields -| report.fields) return error.LimitExceeded;
        const directory_bytes = @as(usize, count) * 12 + 6;
        if (directory_bytes > bytes.len - offset) return error.TruncatedTiffIfd;
        var last_tag: ?u16 = null;
        var strip_offsets: ?Field = null;
        var strip_lengths: ?Field = null;
        var tile_offsets: ?Field = null;
        var tile_lengths: ?Field = null;
        for (0..count) |index| {
            const start = @as(usize, offset) + 2 + index * 12;
            const entry = bytes[start .. start + 12];
            const tag = u16At(entry[0..2], order);
            if (last_tag) |previous| if (tag <= previous) return error.UnsortedTiffTags;
            last_tag = tag;
            const value = try field(bytes, entry, order);
            report.unknown_types += @intFromBool(value.values == null);
            switch (tag) {
                259 => if (report.ifds == 1 and value.count == 1 and value.values != null) {
                    report.first_compression = @intCast(try unsignedAt(value, 0, order));
                },
                273 => strip_offsets = value,
                279 => strip_lengths = value,
                324 => tile_offsets = value,
                325 => tile_lengths = value,
                else => {},
            }
        }
        report.fields += count;
        report.strips += try checkDataBlocks(bytes, order, strip_offsets, strip_lengths, options.max_data_blocks -| (report.strips + report.tiles));
        report.tiles += try checkDataBlocks(bytes, order, tile_offsets, tile_lengths, options.max_data_blocks -| (report.strips + report.tiles));
        offset = u32At(bytes[@as(usize, offset) + directory_bytes - 4 ..][0..4], order);
    }
    return report;
}

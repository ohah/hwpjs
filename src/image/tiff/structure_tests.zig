const std = @import("std");
const t = std.testing;
const structure = @import("structure.zig");

fn put16(bytes: []u8, value: u16, order: structure.ByteOrder) void {
    switch (order) {
        .little => std.mem.writeInt(u16, bytes[0..2], value, .little),
        .big => std.mem.writeInt(u16, bytes[0..2], value, .big),
    }
}

fn put32(bytes: []u8, value: u32, order: structure.ByteOrder) void {
    switch (order) {
        .little => std.mem.writeInt(u32, bytes[0..4], value, .little),
        .big => std.mem.writeInt(u32, bytes[0..4], value, .big),
    }
}

fn entry(bytes: []u8, tag: u16, type_id: u16, count: u32, raw: u32, order: structure.ByteOrder) void {
    put16(bytes[0..2], tag, order);
    put16(bytes[2..4], type_id, order);
    put32(bytes[4..8], count, order);
    put32(bytes[8..12], raw, order);
}

fn sample(order: structure.ByteOrder) [66]u8 {
    var bytes = [_]u8{0} ** 66;
    const ifd: usize = if (order == .little) 8 else 12;
    const strip: u32 = if (order == .little) 62 else 8;
    @memcpy(bytes[0..2], if (order == .little) "II" else "MM");
    put16(bytes[2..4], 42, order);
    put32(bytes[4..8], @intCast(ifd), order);
    put16(bytes[ifd..][0..2], 4, order);
    entry(bytes[ifd + 2 ..][0..12], 256, 4, 1, 10, order);
    entry(bytes[ifd + 14 ..][0..12], 259, 4, 1, 1, order);
    entry(bytes[ifd + 26 ..][0..12], 273, 4, 1, strip, order);
    entry(bytes[ifd + 38 ..][0..12], 279, 4, 1, 4, order);
    return bytes;
}

test "TIFF structure accepts little and big endian IFDs before or after image data" {
    for ([_]structure.ByteOrder{ .little, .big }) |order| {
        const bytes = sample(order);
        const report = try structure.inspect(&bytes, .{});
        try t.expectEqual(order, report.byte_order);
        try t.expectEqual(@as(usize, 1), report.ifds);
        try t.expectEqual(@as(usize, 4), report.fields);
        try t.expectEqual(@as(usize, 1), report.strips);
        try t.expectEqual(@as(?u32, 1), report.first_compression);
        try t.expect(report.pixels_deferred);
    }
}

test "TIFF structure rejects broken header, IFD order, and cycles" {
    var bytes = sample(.little);
    try t.expectError(error.TruncatedTiffHeader, structure.inspect(bytes[0..7], .{}));
    try t.expectError(error.LimitExceeded, structure.inspect(&bytes, .{ .max_bytes = 65 }));
    try t.expectError(error.LimitExceeded, structure.inspect(&bytes, .{ .max_fields = 3 }));
    bytes[0] = 0;
    try t.expectError(error.InvalidTiffByteOrder, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put32(bytes[4..8], 0, .little);
    try t.expectError(error.MissingTiffIfd, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    try t.expectError(error.TruncatedTiffIfd, structure.inspect(bytes[0..61], .{}));
    put16(bytes[8..10], 0, .little);
    try t.expectError(error.EmptyTiffIfd, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    bytes[2] = 0;
    try t.expectError(error.UnsupportedTiffVersion, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put32(bytes[4..8], 9, .little);
    try t.expectError(error.InvalidTiffIfdOffset, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put16(bytes[8 + 14 ..][0..2], 255, .little);
    try t.expectError(error.UnsortedTiffTags, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put32(bytes[8 + 2 + 4 * 12 ..][0..4], 8, .little);
    try t.expectError(error.TiffIfdCycle, structure.inspect(&bytes, .{}));
    try t.expectError(error.LimitExceeded, structure.inspect(&bytes, .{ .max_ifds = 1 }));
}

test "TIFF structure checks external fields and strip range independently" {
    var bytes = sample(.little);
    put32(bytes[8 + 26 + 8 ..][0..4], 64, .little);
    try t.expectError(error.InvalidTiffDataExtent, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put16(bytes[8 + 38 ..][0..2], 280, .little);
    try t.expectError(error.MissingTiffDataByteCounts, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put16(bytes[8 + 2 + 2 ..][0..2], 5, .little);
    put32(bytes[8 + 2 + 8 ..][0..4], 66, .little);
    try t.expectError(error.InvalidTiffFieldExtent, structure.inspect(&bytes, .{}));
    bytes = sample(.little);
    put16(bytes[8 + 2 + 2 ..][0..2], 13, .little);
    const unknown = try structure.inspect(&bytes, .{});
    try t.expectEqual(@as(usize, 1), unknown.unknown_types);
}

test "TIFF structure follows multiple IFDs and external strip arrays" {
    var chained = [_]u8{0} ** 84;
    const first = sample(.little);
    @memcpy(chained[0..first.len], &first);
    put32(chained[58..62], 66, .little);
    put16(chained[66..68], 1, .little);
    entry(chained[68..80], 256, 4, 1, 1, .little);
    const chain = try structure.inspect(&chained, .{});
    try t.expectEqual(@as(usize, 2), chain.ifds);
    try t.expectEqual(@as(usize, 5), chain.fields);
    try t.expectEqual(@as(usize, 1), chain.strips);

    var multiple = [_]u8{0} ** 96;
    @memcpy(multiple[0..first.len], &first);
    put32(multiple[8 + 26 + 4 ..][0..4], 2, .little);
    put32(multiple[8 + 26 + 8 ..][0..4], 66, .little);
    put32(multiple[8 + 38 + 4 ..][0..4], 2, .little);
    put32(multiple[8 + 38 + 8 ..][0..4], 74, .little);
    put32(multiple[66..70], 82, .little);
    put32(multiple[70..74], 86, .little);
    put32(multiple[74..78], 4, .little);
    put32(multiple[78..82], 4, .little);
    const external = try structure.inspect(&multiple, .{});
    try t.expectEqual(@as(usize, 2), external.strips);
    try t.expectEqual(@as(usize, 2), (try structure.inspect(&multiple, .{ .max_data_blocks = 2 })).strips);
    try t.expectError(error.LimitExceeded, structure.inspect(&multiple, .{ .max_data_blocks = 1 }));
    put32(multiple[8 + 38 + 4 ..][0..4], 1, .little);
    try t.expectError(error.InvalidTiffDataCount, structure.inspect(&multiple, .{}));
    put32(multiple[8 + 38 + 4 ..][0..4], 2, .little);
    put32(multiple[8 + 38 + 8 ..][0..4], 75, .little);
    try t.expectError(error.InvalidTiffFieldExtent, structure.inspect(&multiple, .{}));

    var big_multiple = [_]u8{0} ** 96;
    const big_first = sample(.big);
    @memcpy(big_multiple[0..big_first.len], &big_first);
    put32(big_multiple[12 + 26 + 4 ..][0..4], 2, .big);
    put32(big_multiple[12 + 26 + 8 ..][0..4], 66, .big);
    put32(big_multiple[12 + 38 + 4 ..][0..4], 2, .big);
    put32(big_multiple[12 + 38 + 8 ..][0..4], 74, .big);
    put32(big_multiple[66..70], 82, .big);
    put32(big_multiple[70..74], 86, .big);
    put32(big_multiple[74..78], 4, .big);
    put32(big_multiple[78..82], 4, .big);
    try t.expectEqual(@as(usize, 2), (try structure.inspect(&big_multiple, .{})).strips);
}

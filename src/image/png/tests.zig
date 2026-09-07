const std = @import("std");
const t = std.testing;
const png = @import("structure.zig");
fn chunk(out: *std.ArrayList(u8), name: *const [4]u8, payload: []const u8) !void {
    var length: [4]u8 = undefined;
    std.mem.writeInt(u32, &length, @intCast(payload.len), .big);
    try out.appendSlice(t.allocator, &length);
    const crc_start = out.items.len;
    try out.appendSlice(t.allocator, name);
    try out.appendSlice(t.allocator, payload);
    const crc = std.hash.Crc32.hash(out.items[crc_start..]);
    std.mem.writeInt(u32, &length, crc, .big);
    try out.appendSlice(t.allocator, &length);
}
fn header(depth: u8, color: u8) [13]u8 {
    return .{ 0, 0, 0, 1, 0, 0, 0, 1, depth, color, 0, 0, 0 };
}
fn start(out: *std.ArrayList(u8), depth: u8, color: u8) !void {
    try out.appendSlice(t.allocator, png.chunks.signature);
    try chunk(out, "IHDR", &header(depth, color));
}
test "PNG IHDR validates the full color-depth byte matrix and field bounds" {
    for (0..256) |color| for (0..256) |depth| {
        const valid = (color == 0 and (depth == 1 or depth == 2 or depth == 4 or depth == 8 or depth == 16)) or
            ((color == 2 or color == 4 or color == 6) and (depth == 8 or depth == 16)) or
            (color == 3 and (depth == 1 or depth == 2 or depth == 4 or depth == 8));
        const bytes = header(@intCast(depth), @intCast(color));
        if (valid) _ = try png.Header.parse(&bytes) else try t.expectError(error.UnsupportedPngFormat, png.Header.parse(&bytes));
    };
    for ([_]usize{ 0, 4 }) |offset| for ([_]u32{ 0, 1, 0x7fffffff, 0x80000000, 0xffffffff }) |value| {
        var bytes = header(8, 6);
        std.mem.writeInt(u32, bytes[offset..][0..4], value, .big);
        if (value == 0 or value > 0x7fffffff) try t.expectError(error.InvalidPngDimensions, png.Header.parse(&bytes)) else _ = try png.Header.parse(&bytes);
    };
    var largest = header(8, 6);
    std.mem.writeInt(u32, largest[0..4], 0x7fffffff, .big);
    std.mem.writeInt(u32, largest[4..8], 0x7fffffff, .big);
    try t.expectEqual(@as(u64, 0x3fffffff00000001), (try png.Header.parse(&largest)).pixels());
    for (10..13) |field| for (0..256) |value| {
        var bytes = header(8, 6);
        bytes[field] = @intCast(value);
        if (value == 0 or (field == 12 and value == 1)) _ = try png.Header.parse(&bytes) else try t.expectError(error.UnsupportedPngFormat, png.Header.parse(&bytes));
    };
}
test "PNG structure exposes deferred pixels metadata and future reserved-bit chunks" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, 8, 6);
    try chunk(&bytes, "vpAg", "before");
    try chunk(&bytes, "IDAT", "not zlib");
    try chunk(&bytes, "IDAT", "");
    try chunk(&bytes, "vpag", "future");
    try chunk(&bytes, "IEND", "");
    const report = try png.inspect(bytes.items, .{ .chunks = .{ .max_bytes = bytes.items.len, .max_chunk_bytes = 13, .max_chunks = 6 }, .max_pixels = 1 });
    try t.expectEqual(@as(usize, 6), report.chunks);
    try t.expectEqual(@as(usize, 2), report.idat_chunks);
    try t.expectEqual(@as(usize, 8), report.idat_bytes);
    try t.expectEqual(@as(usize, 2), report.ancillary_chunks_deferred);
    try t.expectEqual(@as(usize, 1), report.reserved_bit_chunks);
    try t.expect(!report.pixels_validated);
    for (0..bytes.items.len) |end| {
        if (png.inspect(bytes.items[0..end], .{})) |_| return error.ExpectedRejection else |_| {}
    }
    try t.expectError(error.LimitExceeded, png.inspect(bytes.items, .{ .chunks = .{ .max_bytes = bytes.items.len - 1 } }));
    try t.expectError(error.LimitExceeded, png.inspect(bytes.items, .{ .chunks = .{ .max_chunk_bytes = 12 } }));
    try t.expectError(error.LimitExceeded, png.inspect(bytes.items, .{ .chunks = .{ .max_chunks = 5 } }));
    try t.expectError(error.LimitExceeded, png.inspect(bytes.items, .{ .max_pixels = 0 }));
}
test "PNG chunks check CRC and preserve cursor on failure" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try bytes.appendSlice(t.allocator, png.chunks.signature);
    try chunk(&bytes, "IEND", "");
    try t.expectEqualSlices(u8, &.{ 0xae, 0x42, 0x60, 0x82 }, bytes.items[bytes.items.len - 4 ..]);
    bytes.items[bytes.items.len - 1] ^= 1;
    var it = try png.chunks.Iterator.init(bytes.items, .{});
    try t.expectError(error.InvalidChecksum, it.next());
    try t.expectError(error.InvalidChecksum, it.next());
    try t.expectEqual(@as(usize, 8), it.reader.offset);
    try t.expectEqual(@as(usize, 0), it.count);
    bytes.items[bytes.items.len - 1] ^= 1;
    try t.expect((try it.next()).?.is("IEND"));
    try t.expect((try it.next()) == null);
    std.mem.writeInt(u32, bytes.items[8..12], 0x80000000, .big);
    it = try png.chunks.Iterator.init(bytes.items, .{ .max_chunk_bytes = 0xffffffff });
    try t.expectError(error.InvalidPngChunkLength, it.next());
}
test "PNG critical chunk ordering and palette constraints reject malformed envelopes" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, 1, 3);
    const base = bytes.items.len;
    try chunk(&bytes, "IDAT", "");
    try chunk(&bytes, "IEND", "");
    try t.expectError(error.MissingPngPalette, png.inspect(bytes.items, .{}));
    bytes.shrinkRetainingCapacity(base);
    try chunk(&bytes, "PLTE", &.{ 0, 0, 0, 255, 255, 255 });
    try chunk(&bytes, "IDAT", "");
    try chunk(&bytes, "IEND", "");
    try t.expectEqual(@as(usize, 2), (try png.inspect(bytes.items, .{})).palette_entries);
    try bytes.append(t.allocator, 0);
    try t.expectError(error.TrailingData, png.inspect(bytes.items, .{}));
    const h = try png.Header.parse(&header(1, 3));
    try t.expectError(error.InvalidPngPalette, h.palette(&.{ 0, 0 }));
    try t.expectError(error.InvalidPngPalette, h.palette(&.{ 0, 0, 0, 0, 0, 0, 0, 0, 0 }));
    bytes.clearRetainingCapacity();
    try start(&bytes, 8, 6);
    try chunk(&bytes, "IDAT", "");
    try chunk(&bytes, "tEXt", "");
    try chunk(&bytes, "IDAT", "");
    try t.expectError(error.NonconsecutivePngIdat, png.inspect(bytes.items, .{}));
}

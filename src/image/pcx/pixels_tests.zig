const std = @import("std");
const pixels = @import("pixels.zig");
fn header(bits: u8, planes: u8) [128]u8 {
    var bytes = @as([128]u8, @splat(0));
    bytes[0..4].* = .{ 10, 5, 1, bits };
    std.mem.writeInt(u16, bytes[8..10], 1, .little);
    bytes[65] = planes;
    std.mem.writeInt(u16, bytes[66..68], 2, .little);
    bytes[19..25].* = .{ 10, 20, 30, 40, 50, 60 };
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = header(1, 1) ++ [_]u8{ 0x80, 0 };
    var image = try pixels.decode(a, &bytes, .{});
    defer image.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 10, 20, 30, 255, 0, 0, 0, 255 }, image.rgba);
}
test "PCX pixels decode palette bit order padding and all allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
    const bytes = header(1, 1) ++ [_]u8{ 0x80, 0 };
    try std.testing.expectError(error.LimitExceeded, pixels.decode(std.testing.allocator, &bytes, .{ .max_pixels = 1 }));
}
test "PCX pixels decode planar palette packed nibble indexed VGA and RGB without exposing row padding" {
    const a = std.testing.allocator;
    const planar = header(1, 2) ++ [_]u8{ 0x80, 0, 0x40, 0 };
    var image = try pixels.decode(a, &planar, .{});
    defer image.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 10, 20, 30, 255, 40, 50, 60, 255 }, image.rgba);
    const packed_bytes = header(4, 1) ++ [_]u8{ 0x12, 0 };
    var nibble = try pixels.decode(a, &packed_bytes, .{});
    defer nibble.deinit(a);
    try std.testing.expectEqualSlices(u8, image.rgba, nibble.rgba);
    const rgb = header(8, 3) ++ [_]u8{ 1, 2, 3, 4, 5, 6 };
    var color = try pixels.decode(a, &rgb, .{});
    defer color.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 1, 3, 5, 255, 2, 4, 6, 255 }, color.rgba);
    var palette = @as([769]u8, @splat(0));
    palette[0..7].* = .{ 12, 10, 20, 30, 40, 50, 60 };
    const indexed = header(8, 1) ++ [_]u8{ 0, 1 } ++ palette;
    var vga = try pixels.decode(a, &indexed, .{});
    defer vga.deinit(a);
    try std.testing.expectEqualSlices(u8, image.rgba, vga.rgba);
}
test "PCX pixels actual embedded monochrome image matches independently decoded RGBA hash" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/복학원서.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("../../hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const bytes = try @import("../../hwpx/picture_source_bytes.zig").read(a, &session, 0, 36, 64_000_000);
    defer a.free(bytes);
    var image = try pixels.decode(a, bytes, .{});
    defer image.deinit(a);
    try std.testing.expectEqual(@as(usize, 878), image.width);
    try std.testing.expectEqual(@as(usize, 1001), image.height);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(image.rgba, &digest, .{});
    var expected_buffer: [32]u8 = undefined;
    const expected = try std.fmt.hexToBytes(&expected_buffer, "36644482e326dc3acfbc0523842467758b2f21d50a0f4bf40ba794a0559aad41");
    try std.testing.expectEqualSlices(u8, expected, &digest);
}
test "PCX shared run errors preserve iterator state" {
    var iterator: @import("rle.zig").Iterator = .{ .bytes = &.{ 0xc3, 1 }, .decoded_bytes = 4, .scanline_bytes = 2 };
    const before = iterator;
    try std.testing.expectError(error.PcxRunCrossesScanLine, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
}
test "PCX pixels refuse unsupported color profiles instead of inventing a palette" {
    const a = std.testing.allocator;
    const ambiguous = header(8, 4) ++ @as([8]u8, @splat(0));
    try std.testing.expectError(error.UnsupportedPcxPixelProfile, pixels.decode(a, &ambiguous, .{}));
    const missing_palette = header(8, 1) ++ [_]u8{ 0, 1 };
    try std.testing.expectError(error.UnsupportedPcxPixelProfile, pixels.decode(a, &missing_palette, .{}));
    var old = header(1, 1) ++ [_]u8{ 0, 0 };
    old[1] = 3;
    try std.testing.expectError(error.UnsupportedPcxPixelProfile, pixels.decode(a, &old, .{}));
}

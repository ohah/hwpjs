const std = @import("std");
const geometry = @import("geometry.zig");

pub const byte_size: usize = 16;

pub const TriVertex = struct {
    point: geometry.PointL,
    red: u16,
    green: u16,
    blue: u16,
    alpha: u16,
};

pub fn parse(bytes: []const u8) !TriVertex {
    if (bytes.len != byte_size) return error.InvalidEmfTriVertexSize;
    return .{
        .point = try geometry.parsePointL(bytes[0..8]),
        .red = std.mem.readInt(u16, bytes[8..10], .little),
        .green = std.mem.readInt(u16, bytes[10..12], .little),
        .blue = std.mem.readInt(u16, bytes[12..14], .little),
        .alpha = std.mem.readInt(u16, bytes[14..16], .little),
    };
}

test "TriVertex preserves signed position and all 16-bit color fields" {
    var bytes = [_]u8{0} ** byte_size;
    std.mem.writeInt(i32, bytes[0..4], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, bytes[4..8], std.math.maxInt(i32), .little);
    for ([_]u16{ 0x1122, 0x3344, 0x5566, 0x7788 }, 0..) |value, index|
        std.mem.writeInt(u16, bytes[8 + index * 2 ..][0..2], value, .little);
    const value = try parse(&bytes);
    try std.testing.expectEqual(std.math.minInt(i32), value.point.x);
    try std.testing.expectEqual(std.math.maxInt(i32), value.point.y);
    try std.testing.expectEqual(@as(u16, 0x1122), value.red);
    try std.testing.expectEqual(@as(u16, 0x3344), value.green);
    try std.testing.expectEqual(@as(u16, 0x5566), value.blue);
    try std.testing.expectEqual(@as(u16, 0x7788), value.alpha);
}

test "TriVertex requires exactly 16 bytes" {
    const bytes = [_]u8{0} ** (byte_size + 1);
    try std.testing.expectError(error.InvalidEmfTriVertexSize, parse(bytes[0 .. byte_size - 1]));
    try std.testing.expectError(error.InvalidEmfTriVertexSize, parse(&bytes));
}

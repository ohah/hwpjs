const std = @import("std");
const color_ref = @import("../wmf/color_ref.zig");
const geometry = @import("geometry.zig");
const pen_style = @import("pen_style.zig");

pub const size = 16;

pub const LogPen = struct {
    style: pen_style.Value,
    width: geometry.PointL,
    color: color_ref.ColorRef,
};

pub fn parse(bytes: []const u8) !LogPen {
    if (bytes.len != size) return error.InvalidEmfLogPenSize;
    const style = try pen_style.parse(std.mem.readInt(u32, bytes[0..4], .little));
    const width = try geometry.parsePointL(bytes[4..12]);
    if (style.pen_type == .cosmetic and width.x != 1) return error.InvalidEmfCosmeticPenWidth;
    return .{
        .style = style,
        .width = width,
        .color = try color_ref.parse(bytes[12..16], .specified_zero),
    };
}

test "LogPen preserves signed width ignored y and ColorRef order" {
    var bytes = [_]u8{0} ** size;
    std.mem.writeInt(u32, bytes[0..4], 0x00012107, .little);
    std.mem.writeInt(i32, bytes[4..8], -4, .little);
    std.mem.writeInt(i32, bytes[8..12], 99, .little);
    bytes[12..16].* = .{ 1, 2, 3, 0 };
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(i32, -4), value.width.x);
    try std.testing.expectEqual(@as(i32, 99), value.width.y);
    try std.testing.expectEqual(@as(u32, 0x00030201), value.color.raw);
}

test "LogPen requires exact size cosmetic width one and specified ColorRef" {
    var bytes = [_]u8{0} ** (size + 1);
    std.mem.writeInt(i32, bytes[4..8], 1, .little);
    for (0..size) |cut| try std.testing.expectError(error.InvalidEmfLogPenSize, parse(bytes[0..cut]));
    try std.testing.expectError(error.InvalidEmfLogPenSize, parse(&bytes));
    std.mem.writeInt(i32, bytes[4..8], 0, .little);
    try std.testing.expectError(error.InvalidEmfCosmeticPenWidth, parse(bytes[0..size]));
    std.mem.writeInt(i32, bytes[4..8], 1, .little);
    bytes[15] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(bytes[0..size]));
}

const std = @import("std");
const color_ref = @import("../wmf/color_ref.zig");

pub const size = 12;
pub const Style = enum(u32) { solid = 0, null = 1, hatched = 2 };

pub const LogBrushEx = struct {
    style: Style,
    color_raw: u32,
    color: ?color_ref.ColorRef,
    hatch_raw: u32,
    hatch: ?u3,
};

pub fn parse(bytes: []const u8) !LogBrushEx {
    if (bytes.len != size) return error.InvalidEmfLogBrushExSize;
    const style: Style = switch (std.mem.readInt(u32, bytes[0..4], .little)) {
        0 => .solid,
        1 => .null,
        2 => .hatched,
        else => return error.UnsupportedEmfBrushStyle,
    };
    const color_raw = std.mem.readInt(u32, bytes[4..8], .little);
    const hatch_raw = std.mem.readInt(u32, bytes[8..12], .little);
    const color = if (style == .null) null else try color_ref.parse(bytes[4..8], .specified_zero);
    const hatch: ?u3 = if (style == .hatched) blk: {
        if (hatch_raw > 5) return error.UnsupportedEmfHatchStyle;
        break :blk @intCast(hatch_raw);
    } else null;
    return .{ .style = style, .color_raw = color_raw, .color = color, .hatch_raw = hatch_raw, .hatch = hatch };
}

test "LogBrushEx interprets only fields used by each style" {
    var bytes = [_]u8{0} ** size;
    bytes[4..8].* = .{ 1, 2, 3, 0 };
    std.mem.writeInt(u32, bytes[8..12], std.math.maxInt(u32), .little);
    const solid = try parse(&bytes);
    try std.testing.expectEqual(Style.solid, solid.style);
    try std.testing.expectEqual(std.math.maxInt(u32), solid.hatch_raw);
    try std.testing.expectEqual(@as(?u3, null), solid.hatch);

    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    bytes[7] = 0xff;
    const null_brush = try parse(&bytes);
    try std.testing.expectEqual(@as(?color_ref.ColorRef, null), null_brush.color);

    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    bytes[7] = 0;
    std.mem.writeInt(u32, bytes[8..12], 5, .little);
    const hatched = try parse(&bytes);
    try std.testing.expectEqual(@as(?u3, 5), hatched.hatch);
}

test "LogBrushEx rejects size style used ColorRef and hatch violations" {
    var bytes = [_]u8{0} ** (size + 1);
    for (0..size) |cut| try std.testing.expectError(error.InvalidEmfLogBrushExSize, parse(bytes[0..cut]));
    try std.testing.expectError(error.InvalidEmfLogBrushExSize, parse(&bytes));
    std.mem.writeInt(u32, bytes[0..4], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfBrushStyle, parse(bytes[0..size]));
    std.mem.writeInt(u32, bytes[0..4], 0, .little);
    bytes[7] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(bytes[0..size]));
    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    bytes[7] = 0;
    std.mem.writeInt(u32, bytes[8..12], 6, .little);
    try std.testing.expectError(error.UnsupportedEmfHatchStyle, parse(bytes[0..size]));
}

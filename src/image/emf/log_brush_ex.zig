const std = @import("std");
const color_ref = @import("../wmf/color_ref.zig");
const brush_style = @import("brush_style.zig");
const hatch_style = @import("hatch_style.zig");

pub const size = 12;
pub const LogBrushEx = struct {
    style: brush_style.Style,
    color_raw: u32,
    color: ?color_ref.ColorRef,
    hatch_raw: u32,
    hatch: ?hatch_style.Standard,
};

pub fn parse(bytes: []const u8) !LogBrushEx {
    if (bytes.len != size) return error.InvalidEmfLogBrushExSize;
    const style = try brush_style.parse(std.mem.readInt(u32, bytes[0..4], .little));
    if (style != .solid and style != .null and style != .hatched) return error.UnsupportedEmfCreateBrushStyle;
    const color_raw = std.mem.readInt(u32, bytes[4..8], .little);
    const hatch_raw = std.mem.readInt(u32, bytes[8..12], .little);
    const color = if (style == .null) null else try color_ref.parse(bytes[4..8], .specified_zero);
    const hatch = if (style == .hatched) try hatch_style.parseStandard(hatch_raw) else null;
    return .{ .style = style, .color_raw = color_raw, .color = color, .hatch_raw = hatch_raw, .hatch = hatch };
}

test "LogBrushEx interprets only fields used by each style" {
    var bytes = [_]u8{0} ** size;
    bytes[4..8].* = .{ 1, 2, 3, 0 };
    std.mem.writeInt(u32, bytes[8..12], std.math.maxInt(u32), .little);
    const solid = try parse(&bytes);
    try std.testing.expectEqual(brush_style.Style.solid, solid.style);
    try std.testing.expectEqual(std.math.maxInt(u32), solid.hatch_raw);
    try std.testing.expectEqual(@as(?hatch_style.Standard, null), solid.hatch);

    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    bytes[7] = 0xff;
    const null_brush = try parse(&bytes);
    try std.testing.expectEqual(@as(?color_ref.ColorRef, null), null_brush.color);

    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    bytes[7] = 0;
    std.mem.writeInt(u32, bytes[8..12], 5, .little);
    const hatched = try parse(&bytes);
    try std.testing.expectEqual(@as(?hatch_style.Standard, .diagonal_cross), hatched.hatch);
}

test "LogBrushEx rejects size style used ColorRef and hatch violations" {
    var bytes = [_]u8{0} ** (size + 1);
    for (0..size) |cut| try std.testing.expectError(error.InvalidEmfLogBrushExSize, parse(bytes[0..cut]));
    try std.testing.expectError(error.InvalidEmfLogBrushExSize, parse(&bytes));
    std.mem.writeInt(u32, bytes[0..4], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfCreateBrushStyle, parse(bytes[0..size]));
    std.mem.writeInt(u32, bytes[0..4], 0, .little);
    bytes[7] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(bytes[0..size]));
    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    bytes[7] = 0;
    std.mem.writeInt(u32, bytes[8..12], 6, .little);
    try std.testing.expectError(error.UnsupportedEmfHatchStyle, parse(bytes[0..size]));
}

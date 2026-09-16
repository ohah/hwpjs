const std = @import("std");
const argb = @import("emf_plus_argb.zig");
const values = @import("emf_plus_brush_values.zig");

pub const Solid = struct { color: argb.Argb };
pub const Hatch = struct {
    style: values.HatchStyle,
    foreground: argb.Argb,
    background: argb.Argb,
};

pub fn parseSolid(bytes: []const u8) !Solid {
    if (bytes.len != 4) return error.InvalidEmfPlusSolidBrushSize;
    return .{ .color = argb.Argb.fromRaw(std.mem.readInt(u32, bytes[0..4], .little)) };
}

pub fn parseHatch(bytes: []const u8) !Hatch {
    if (bytes.len != 12) return error.InvalidEmfPlusHatchBrushSize;
    return .{
        .style = try values.hatchStyle(std.mem.readInt(u32, bytes[0..4], .little)),
        .foreground = argb.Argb.fromRaw(std.mem.readInt(u32, bytes[4..8], .little)),
        .background = argb.Argb.fromRaw(std.mem.readInt(u32, bytes[8..12], .little)),
    };
}

test "EMF+ solid and hatch brushes parse exact official fields" {
    const solid = try parseSolid(&.{ 1, 2, 3, 4 });
    try std.testing.expectEqual(@as(u32, 0x04030201), solid.color.raw());
    const hatch = try parseHatch(&.{ 0x34, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8 });
    try std.testing.expectEqual(values.HatchStyle.solid_diamond, hatch.style);
    try std.testing.expectEqual(@as(u32, 0x04030201), hatch.foreground.raw());
    try std.testing.expectEqual(@as(u32, 0x08070605), hatch.background.raw());
}

test "EMF+ simple brushes reject every wrong size and hatch style" {
    const solid = [_]u8{0} ** 5;
    for (0..solid.len + 1) |size| if (size != 4)
        try std.testing.expectError(error.InvalidEmfPlusSolidBrushSize, parseSolid(solid[0..size]));
    const hatch = [_]u8{0} ** 13;
    for (0..hatch.len + 1) |size| if (size != 12)
        try std.testing.expectError(error.InvalidEmfPlusHatchBrushSize, parseHatch(hatch[0..size]));
    var invalid = [_]u8{0} ** 12;
    std.mem.writeInt(u32, invalid[0..4], 0x35, .little);
    try std.testing.expectError(error.InvalidEmfPlusHatchStyle, parseHatch(&invalid));
}

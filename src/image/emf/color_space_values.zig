const std = @import("std");

pub const LogicalColorSpace = enum(u32) {
    calibrated_rgb = 0x00000000,
    srgb = 0x73524742,
    windows = 0x57696e20,
};

pub const GamutMappingIntent = enum(u32) {
    business = 0x00000001,
    graphics = 0x00000002,
    images = 0x00000004,
    absolute_colorimetric = 0x00000008,
};

pub fn logical(value: u32) !LogicalColorSpace {
    return std.enums.fromInt(LogicalColorSpace, value) orelse error.InvalidEmfLogicalColorSpace;
}

pub fn intent(value: u32) !GamutMappingIntent {
    return std.enums.fromInt(GamutMappingIntent, value) orelse error.InvalidEmfGamutMappingIntent;
}

test "logical color-space and gamut intent values are exact" {
    for ([_]u32{ 0, 0x73524742, 0x57696e20 }) |value|
        try std.testing.expectEqual(value, @intFromEnum(try logical(value)));
    for ([_]u32{ 1, 2, 4, 8 }) |value|
        try std.testing.expectEqual(value, @intFromEnum(try intent(value)));
    for ([_]u32{ 3, 0x4c494e4b, 0x4d424544, std.math.maxInt(u32) }) |value|
        try std.testing.expectError(error.InvalidEmfLogicalColorSpace, logical(value));
    for ([_]u32{ 0, 3, 7, 16, std.math.maxInt(u32) }) |value|
        try std.testing.expectError(error.InvalidEmfGamutMappingIntent, intent(value));
}

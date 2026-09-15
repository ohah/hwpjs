const std = @import("std");

pub const FloodFillMode = enum(u32) {
    border = 0,
    surface = 1,
};

pub fn parse(raw: u32) !FloodFillMode {
    return std.enums.fromInt(FloodFillMode, raw) orelse error.InvalidEmfFloodFillMode;
}

test "FloodFillMode accepts only both specified values" {
    try std.testing.expectEqual(FloodFillMode.border, try parse(0));
    try std.testing.expectEqual(FloodFillMode.surface, try parse(1));
    try std.testing.expectError(error.InvalidEmfFloodFillMode, parse(2));
    try std.testing.expectError(error.InvalidEmfFloodFillMode, parse(std.math.maxInt(u32)));
}

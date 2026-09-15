const std = @import("std");

pub const GradientFillMode = enum(u32) {
    rectangle_horizontal = 0,
    rectangle_vertical = 1,
    triangle = 2,

    pub fn isRectangle(self: GradientFillMode) bool {
        return self != .triangle;
    }
};

pub fn parse(raw: u32) !GradientFillMode {
    return std.enums.fromInt(GradientFillMode, raw) orelse error.InvalidEmfGradientFillMode;
}

test "GradientFillMode preserves both rectangle directions and triangle" {
    try std.testing.expect((try parse(0)).isRectangle());
    try std.testing.expect((try parse(1)).isRectangle());
    try std.testing.expect(!(try parse(2)).isRectangle());
    try std.testing.expectError(error.InvalidEmfGradientFillMode, parse(3));
    try std.testing.expectError(error.InvalidEmfGradientFillMode, parse(std.math.maxInt(u32)));
}

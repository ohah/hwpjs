const std = @import("std");
pub const Fraction = Normalized(64);
pub const WideFraction = Normalized(256);
/// Exact normalized coordinate; may be unreduced. Cross products use twice the width.
pub fn Normalized(comptime bits: u16) type {
    const U = switch (bits) {
        64 => u64,
        128 => u128,
        256 => u256,
        else => @compileError("unsupported ICC fraction width"),
    };
    const W = switch (bits) {
        64 => u128,
        128 => u256,
        256 => u512,
        else => unreachable,
    };
    return struct {
        const Self = @This();
        numerator: U,
        denominator: U,
        pub fn validate(self: Self) !void {
            if (self.denominator == 0 or self.numerator > self.denominator) return error.InvalidIccCurveCoordinate;
        }
        pub fn order(self: Self, other: Self) !std.math.Order {
            try self.validate();
            try other.validate();
            return std.math.order(@as(W, self.numerator) * other.denominator, @as(W, other.numerator) * self.denominator);
        }
        /// Lossy conversion for analytic evaluation, never used for sampled interpolation.
        pub fn toFloat(self: Self) !f64 {
            @setFloatMode(.strict);
            try self.validate();
            return @as(f64, @floatFromInt(self.numerator)) / @as(f64, @floatFromInt(self.denominator));
        }
    };
}

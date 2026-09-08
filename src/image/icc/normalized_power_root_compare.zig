const std = @import("std");
const Root = @import("normalized_power_level.zig").Root;
const equality = @import("rational_power_equality.zig").Of(256);
const bounds = @import("positive_bounds.zig");

/// BASE root relative to a signed exact rational. Overlap is undecided, not equality.
pub fn compare(comptime precision: u16, root: Root, n: i256, d: u256) !?std.math.Order {
    if (d == 0) return error.InvalidIccRootCoordinate;
    const radical = switch (root) {
        .zero => return std.math.order(@as(i256, 0), n),
        .nonzero => |r| r,
    };
    try radical.validate();
    if (n == 0 or radical.negative != (n < 0)) return if (radical.negative) .lt else .gt;
    const magnitude: u256 = @abs(n);
    const reciprocal = radical.exponent_numerator < 0;
    const a = if (reciprocal) radical.denominator else radical.numerator;
    const b = if (reciprocal) radical.numerator else radical.denominator;
    if (equality.matches(a, b, 65536, radical.exponent_denominator, magnitude, d)) return .eq;
    const A = bounds.Arithmetic(precision);
    const left = try A.power(try A.fraction(a, b), 65536);
    const right = try A.power(try A.fraction(magnitude, d), radical.exponent_denominator);
    const order = A.separated(left, right) orelse return null;
    return if (!radical.negative) order else order.invert();
}

pub fn at(comptime precision: u16, root: Root, a: i32, b: i32, x: @import("fraction.zig").Fraction) !?std.math.Order {
    const value = try @import("affine_value.zig").at(a, b, x);
    return compare(precision, root, value.numerator, value.denominator);
}

const std = @import("std");
const Root = @import("power_level.zig").Root;
const Fraction = @import("fraction.zig").Fraction;
const equality = @import("radical_equality.zig");
const bounds = @import("positive_bounds.zig");
/// Root relative to an exact signed rational. null means precision was insufficient.
/// Equality is proved algebraically; inequalities require disjoint directed bounds.
pub fn compare(comptime precision: u16, root: Root, n: i128, d: u128) !?std.math.Order {
    if (d == 0) return error.InvalidIccRootCoordinate;
    const radical = switch (root) {
        .zero => return std.math.order(@as(i128, 0), n),
        .nonzero => |r| r,
    };
    try radical.validate();
    if (n == 0 or radical.negative != (n < 0)) return if (radical.negative) .lt else .gt;
    const magnitude: u128 = @abs(n);
    if (equality.matches(radical, magnitude, d)) return .eq;
    const A = bounds.Arithmetic(precision);
    const reciprocal = radical.exponent_numerator < 0;
    const left = try A.power(try A.fraction(if (reciprocal) 65536 else radical.numerator, if (reciprocal) radical.numerator else 65536), 65536);
    const right = try A.power(try A.fraction(magnitude, d), radical.exponent_denominator);
    const order = A.separated(left, right) orelse return null;
    return if (!radical.negative) order else order.invert();
}
/// Compare a BASE root with (a*x+b)/65536, retaining the exact normalized x.
/// The caller owns affine orientation, active interval membership and a=0 policy.
pub fn at(comptime precision: u16, root: Root, a: i32, b: i32, x: Fraction) !?std.math.Order {
    const value = try @import("affine_value.zig").at(a, b, x);
    return compare(precision, root, value.numerator, value.denominator);
}

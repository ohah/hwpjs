const std = @import("std");
const Root = @import("normalized_power_level.zig").Root;
const bounds = @import("positive_bounds.zig");

/// BASE root relative to a signed exact rational. Overlap is undecided, not equality.
pub fn compare(comptime precision: u16, root: Root, n: i256, d: u256) !?std.math.Order {
    return compareFor(256, precision, root, n, d);
}
pub fn compareWide(comptime precision: u16, root: @import("normalized_power_level.zig").Wide.Root, n: i1024, d: u1024) !?std.math.Order {
    return compareFor(1024, precision, root, n, d);
}
fn compareFor(comptime width: u16, comptime precision: u16, root: anytype, n: std.meta.Int(.signed, width), d: std.meta.Int(.unsigned, width)) !?std.math.Order {
    const equality = @import("rational_power_equality.zig").Of(width);
    if (d == 0) return error.InvalidIccRootCoordinate;
    const radical = switch (root) {
        .zero => return std.math.order(@as(std.meta.Int(.signed, width), 0), n),
        .nonzero => |r| r,
    };
    try radical.validate();
    if (n == 0 or radical.negative != (n < 0)) return if (radical.negative) .lt else .gt;
    const magnitude = @abs(n);
    const reciprocal = radical.exponent_numerator < 0;
    const a = if (reciprocal) radical.denominator else radical.numerator;
    const b = if (reciprocal) radical.numerator else radical.denominator;
    if (equality.matches(a, b, 65536, radical.exponent_denominator, magnitude, d)) return .eq;
    const A = bounds.Arithmetic(precision);
    const left_base = if (width == 256) try A.fraction(a, b) else try A.fractionExtended(a, b);
    const right_base = if (width == 256) try A.fraction(magnitude, d) else try A.fractionExtended(magnitude, d);
    const left = try A.power(left_base, 65536);
    const right = try A.power(right_base, radical.exponent_denominator);
    const order = A.separated(left, right) orelse return null;
    return if (!radical.negative) order else order.invert();
}

pub fn at(comptime precision: u16, root: Root, a: i32, b: i32, x: @import("fraction.zig").Fraction) !?std.math.Order {
    const value = try @import("affine_value.zig").at(a, b, x);
    return compare(precision, root, value.numerator, value.denominator);
}
/// Adapter for the common affine locator; affine coordinate construction stays shared.
pub const Wide = struct {
    pub fn at(comptime precision: u16, root: @import("normalized_power_level.zig").Wide.Root, a: i32, b: i32, x: @import("fraction.zig").Fraction) !?std.math.Order {
        const value = try @import("affine_value.zig").at(a, b, x);
        return compareWide(precision, root, value.numerator, value.denominator);
    }
};

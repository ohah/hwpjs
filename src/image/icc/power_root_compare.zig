const std = @import("std");
const Root = @import("power_level.zig").Root;
const Fraction = @import("fraction.zig").Fraction;
const wide = @import("normalized_power_root_compare.zig");
/// Root relative to an exact signed rational. null means precision was insufficient.
/// Equality is proved algebraically; inequalities require disjoint directed bounds.
pub fn compare(comptime precision: u16, root: Root, n: i128, d: u128) !?std.math.Order {
    if (d == 0) return error.InvalidIccRootCoordinate;
    const radical = switch (root) {
        .zero => return std.math.order(@as(i128, 0), n),
        .nonzero => |r| r,
    };
    try radical.validate();
    return wide.compare(precision, .{ .nonzero = .{
        .negative = radical.negative,
        .numerator = radical.numerator,
        .denominator = 65536,
        .exponent_numerator = radical.exponent_numerator,
        .exponent_denominator = radical.exponent_denominator,
    } }, n, d);
}
/// Compare a BASE root with (a*x+b)/65536, retaining the exact normalized x.
/// The caller owns affine orientation, active interval membership and a=0 policy.
pub fn at(comptime precision: u16, root: Root, a: i32, b: i32, x: Fraction) !?std.math.Order {
    const value = try @import("affine_value.zig").at(a, b, x);
    return compare(precision, root, value.numerator, value.denominator);
}

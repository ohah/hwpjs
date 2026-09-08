const std = @import("std");
const Root = @import("normalized_power_level.zig").Root;

fn sign(root: Root) i8 {
    return switch (root) {
        .zero => 0,
        .nonzero => |r| if (r.negative) -1 else 1,
    };
}

/// Exact order for the same encoded reciprocal exponent; zero is universal.
pub fn compare(a: Root, b: Root) !std.math.Order {
    if (a == .nonzero) try a.nonzero.validate();
    if (b == .nonzero) try b.nonzero.validate();
    if (a == .nonzero and b == .nonzero and (a.nonzero.exponent_numerator != b.nonzero.exponent_numerator or a.nonzero.exponent_denominator != b.nonzero.exponent_denominator)) return error.IncompatibleIccPowerRoots;
    const signs = std.math.order(sign(a), sign(b));
    if (signs != .eq or a == .zero) return signs;
    const order = std.math.order(@as(u512, a.nonzero.numerator) * b.nonzero.denominator, @as(u512, b.nonzero.numerator) * a.nonzero.denominator);
    return if ((a.nonzero.exponent_numerator < 0) != a.nonzero.negative) order.invert() else order;
}

pub fn inAffine(a: Root, b: Root, slope: i32) !std.math.Order {
    if (slope == 0) return error.NonIsolatedIccAffineRoot;
    const order = try compare(a, b);
    return if (slope > 0) order else order.invert();
}

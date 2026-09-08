const std = @import("std");
const Root = @import("normalized_power_level.zig").Root;

fn sign(root: anytype) i8 {
    return switch (root) {
        .zero => 0,
        .nonzero => |r| if (r.negative) -1 else 1,
    };
}

/// Exact order for the same encoded reciprocal exponent; zero is universal.
pub fn compare(a: Root, b: Root) !std.math.Order {
    return compareFor(512, a, b);
}
pub const Wide = struct {
    const R = @import("normalized_power_level.zig").Wide.Root;
    pub fn compare(a: R, b: R) !std.math.Order {
        return compareFor(2048, a, b);
    }
    pub fn inAffine(a: R, b: R, slope: i32) !std.math.Order {
        return affineFor(2048, a, b, slope);
    }
};
fn compareFor(comptime product_bits: u16, a: anytype, b: @TypeOf(a)) !std.math.Order {
    const U = std.meta.Int(.unsigned, product_bits);
    if (a == .nonzero) try a.nonzero.validate();
    if (b == .nonzero) try b.nonzero.validate();
    if (a == .nonzero and b == .nonzero and (a.nonzero.exponent_numerator != b.nonzero.exponent_numerator or a.nonzero.exponent_denominator != b.nonzero.exponent_denominator)) return error.IncompatibleIccPowerRoots;
    const signs = std.math.order(sign(a), sign(b));
    if (signs != .eq or a == .zero) return signs;
    const order = std.math.order(@as(U, a.nonzero.numerator) * b.nonzero.denominator, @as(U, b.nonzero.numerator) * a.nonzero.denominator);
    return if ((a.nonzero.exponent_numerator < 0) != a.nonzero.negative) order.invert() else order;
}

pub fn inAffine(a: Root, b: Root, slope: i32) !std.math.Order {
    return affineFor(512, a, b, slope);
}
fn affineFor(comptime product_bits: u16, a: anytype, b: @TypeOf(a), slope: i32) !std.math.Order {
    if (slope == 0) return error.NonIsolatedIccAffineRoot;
    const order = try compareFor(product_bits, a, b);
    return if (slope > 0) order else order.invert();
}

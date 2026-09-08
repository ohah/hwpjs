const std = @import("std");
const Root = @import("power_level.zig").Root;
const widen = @import("power_level.zig").widen;
/// Exact order of roots with the same encoded reciprocal exponent. Zero is universal.
pub fn compare(a: Root, b: Root) !std.math.Order {
    return @import("normalized_root_order.zig").compare(try widen(a), try widen(b));
}
pub fn inAffine(a: Root, b: Root, slope: i32) !std.math.Order {
    if (slope == 0) return error.NonIsolatedIccAffineRoot;
    const order = try compare(a, b);
    return if (slope > 0) order else order.invert();
}

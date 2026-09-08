const std = @import("std");
const Value = @import("affine_value.zig").Value;
const rational = @import("rational_power_order.zig");
/// Exact order of two rational bases raised to the same encoded exponent.
/// A shared additive offset cancels; this is not a mixed-exponent comparator.
pub fn compare(g: i32, a: Value, b: Value) !std.math.Order {
    // A zero target exercises shared real-domain validation and exact sign paths.
    const sa = (try rational.compare(128, a.numerator, a.denominator, g, 0, 1)).?;
    const sb = (try rational.compare(128, b.numerator, b.denominator, g, 0, 1)).?;
    if (sa != sb) return if (sa == .lt or sb == .gt) .lt else .gt;
    if (sa == .eq or g == 0) return .eq;
    const magnitude = std.math.order(@as(u256, @abs(a.numerator)) * b.denominator, @as(u256, @abs(b.numerator)) * a.denominator);
    return if ((g < 0) != (sa == .lt)) magnitude.invert() else magnitude;
}

const std = @import("std");
const Linear = @import("parametric_segments.zig").Linear;
const intervals = @import("unit_interval.zig");
const fractions = @import("fraction.zig");
pub const Interval = intervals.WideInterval;
fn orderAtStart(linear: Linear, n: u128, d: u128) !std.math.Order {
    const value = try @import("affine_value.zig").at(linear.slope, linear.offset, linear.interval.start);
    return std.math.order(@as(i256, value.numerator) * d, @as(i256, n) * value.denominator);
}
fn accepts(order: std.math.Order, n: u128, d: u128) bool {
    return if (n == 0) order != .gt else if (n == d) order != .lt else order == .eq;
}
/// Complete preimage contribution of ONE clipped affine branch for normalized u128 y.
/// null means no attained solution, not nearest-y selection. Does not invert a whole curve.
pub fn solve(linear: Linear, n: u128, d: u128) !?Interval {
    const active = try intervals.widen(linear.interval);
    try (fractions.Normalized(128){ .numerator = n, .denominator = d }).validate();
    if (linear.slope == 0) return if (accepts(try orderAtStart(linear, n, d), n, d)) active else null;
    var numerator = @as(i256, 65536) * n - @as(i256, linear.offset) * d;
    var denominator = @as(i256, linear.slope) * d;
    if (denominator < 0) {
        numerator = -numerator;
        denominator = -denominator;
    }
    if (numerator < 0 or numerator > denominator) {
        if (n != 0 and n != d) return null;
        return if (accepts(try orderAtStart(linear, n, d), n, d)) active else null;
    }
    const root = fractions.WideFraction{ .numerator = @intCast(numerator), .denominator = @intCast(denominator) };
    if (n != 0 and n != d) return active.intersection(.{ .start = root, .end = root });
    const take_left = (n == 0) == (linear.slope > 0);
    return active.intersection(if (take_left) .{ .start = .{ .numerator = 0, .denominator = 1 }, .end = root } else .{ .start = root, .end = .{ .numerator = 1, .denominator = 1 } });
}

const std = @import("std");
const Linear = @import("parametric_segments.zig").Linear;
const intervals = @import("unit_interval.zig");
const fractions = @import("fraction.zig");
pub const Interval = intervals.WideInterval;
pub const ExtendedInterval = intervals.ExtendedInterval;
fn orderAtStart(comptime width: u16, linear: Linear, n: anytype, d: @TypeOf(n)) !std.math.Order {
    const I = std.meta.Int(.signed, width);
    const value = try @import("affine_value.zig").at(linear.slope, linear.offset, linear.interval.start);
    return std.math.order(@as(I, value.numerator) * d, @as(I, n) * value.denominator);
}
fn accepts(order: std.math.Order, n: anytype, d: @TypeOf(n)) bool {
    return if (n == 0) order != .gt else if (n == d) order != .lt else order == .eq;
}
/// Complete preimage contribution of ONE clipped affine branch for normalized u128 y.
/// null means no attained solution, not nearest-y selection. Does not invert a whole curve.
pub fn solve(linear: Linear, n: u128, d: u128) !?Interval {
    return solveFor(128, linear, n, d);
}
pub fn solveWide(linear: Linear, n: u512, d: u512) !?ExtendedInterval {
    return solveFor(512, linear, n, d);
}
fn solveFor(comptime bits: u16, linear: Linear, n: std.meta.Int(.unsigned, bits), d: std.meta.Int(.unsigned, bits)) !?(if (bits == 128) Interval else ExtendedInterval) {
    const width = if (bits == 128) 256 else 1024;
    const I = std.meta.Int(.signed, width);
    const active = if (bits == 128) try intervals.widen(linear.interval) else try intervals.extend(linear.interval);
    try (fractions.Normalized(bits){ .numerator = n, .denominator = d }).validate();
    if (linear.slope == 0) return if (accepts(try orderAtStart(width, linear, n, d), n, d)) active else null;
    var numerator = @as(I, 65536) * n - @as(I, linear.offset) * d;
    var denominator = @as(I, linear.slope) * d;
    if (denominator < 0) {
        numerator = -numerator;
        denominator = -denominator;
    }
    if (numerator < 0 or numerator > denominator) {
        if (n != 0 and n != d) return null;
        return if (accepts(try orderAtStart(width, linear, n, d), n, d)) active else null;
    }
    const root = fractions.Normalized(width){ .numerator = @intCast(numerator), .denominator = @intCast(denominator) };
    if (n != 0 and n != d) return active.intersection(.{ .start = root, .end = root });
    const take_left = (n == 0) == (linear.slope > 0);
    return active.intersection(if (take_left) .{ .start = .{ .numerator = 0, .denominator = 1 }, .end = root } else .{ .start = root, .end = .{ .numerator = 1, .denominator = 1 } });
}

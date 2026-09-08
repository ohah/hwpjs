const std = @import("std");
const Root = @import("power_level.zig").Root;
const Interval = @import("unit_interval.zig").Interval;
const comparison = @import("power_root_compare.zig");
pub const Location = enum(u32) { absent, start, interior, end, singleton, entire, undecided };
fn oriented(order: ?std.math.Order, slope: i32) ?std.math.Order {
    const value = order orelse return null;
    if (slope > 0) return value;
    return value.invert();
}
/// Locate the x preimage of a BASE root under (a*x+b)/65536 on a nonempty interval.
/// Does not validate an entire parametric curve or silently resolve uncertain bounds.
pub fn locate(comptime precision: u16, root: Root, a: i32, b: i32, interval: Interval) !Location {
    try interval.validate();
    const start_order = try comparison.at(precision, root, a, b, interval.start);
    if (a == 0) return if (start_order) |order| (if (order == .eq) .entire else .absent) else .undecided;
    if (try interval.start.order(interval.end) == .eq)
        return if (start_order) |order| (if (order == .eq) .singleton else .absent) else .undecided;
    const start = oriented(start_order, a);
    if (start) |order| switch (order) {
        .lt => return .absent,
        .eq => return if (interval.start_included) .start else .absent,
        .gt => {},
    };
    const end = oriented(try comparison.at(precision, root, a, b, interval.end), a);
    if (end) |order| switch (order) {
        .gt => return .absent,
        .eq => return if (interval.end_included) .end else .absent,
        .lt => {},
    };
    return if (start != null and end != null) .interior else .undecided;
}

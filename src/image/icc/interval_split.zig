const Interval = @import("unit_interval.zig").Interval;
const Fraction = @import("fraction.zig").Fraction;
pub const Result = struct { left: ?Interval, right: ?Interval };
/// Partition at cut, assigning an attained cut to the right. Preserve outer openness.
pub fn split(interval: Interval, cut: Fraction) !Result {
    try interval.validate();
    if (try cut.order(interval.start) != .gt) return .{ .left = null, .right = interval };
    const end_order = try cut.order(interval.end);
    if (end_order == .gt or (end_order == .eq and !interval.end_included)) return .{ .left = interval, .right = null };
    var left = interval;
    left.end = cut;
    left.end_included = false;
    var right = interval;
    right.start = cut;
    right.start_included = true;
    return .{ .left = left, .right = right };
}

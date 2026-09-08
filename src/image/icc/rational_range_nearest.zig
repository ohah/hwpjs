pub const Interval = @import("unit_interval.zig").WideInterval;
pub const types = @import("nearest_ordinate_types.zig");
pub const Target = @import("ordinate_distance.zig").Target;
pub const Result = types.Result;
/// Nearest attained ordinates in a complete union of rational output intervals.
/// Not a curve range constructor, x inverse selection, or algebraic range solver.
pub fn select(target: Target, ranges: []const Interval) !Result {
    try target.validate();
    for (ranges) |interval| try interval.validate();
    var accumulator = @import("nearest_ordinate_candidates.zig").Accumulator{ .target = target };
    const y = @import("fraction.zig").WideFraction{ .numerator = target.numerator, .denominator = target.denominator };
    for (ranges) |interval| {
        const candidate: types.Candidate = if (try interval.contains(y)) .{ .value = y, .attained = true } else if (try y.order(interval.start) != .gt) .{
            .value = interval.start,
            .attained = interval.start_included,
        } else .{ .value = interval.end, .attained = interval.end_included };
        try accumulator.add(candidate);
    }
    return accumulator.finish();
}

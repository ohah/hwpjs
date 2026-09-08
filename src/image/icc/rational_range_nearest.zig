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
    for (ranges) |interval| {
        try accumulator.add(try @import("rational_interval_nearest.zig").candidate(target, interval));
    }
    return accumulator.finish();
}

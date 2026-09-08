pub const Candidate = @import("nearest_ordinate_types.zig").Candidate;
pub fn candidate(target: @import("ordinate_distance.zig").Target, interval: @import("unit_interval.zig").WideInterval) !Candidate {
    try target.validate();
    try interval.validate();
    const y = @import("fraction.zig").WideFraction{ .numerator = target.numerator, .denominator = target.denominator };
    if (try interval.contains(y)) return .{ .value = y, .attained = true };
    return if (try y.order(interval.start) != .gt) .{ .value = interval.start, .attained = interval.start_included } else .{ .value = interval.end, .attained = interval.end_included };
}

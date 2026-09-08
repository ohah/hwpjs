const F = @import("fraction.zig");
const candidates = @import("parametric_nearest_candidates.zig");
pub const types = @import("parametric_nearest_types.zig");
pub const Result = types.Result;
pub const Target = F.Normalized(128);
/// Nearest attained output(s) of both clipped branches, not an inverse x policy.
pub fn select(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: Target) !Result {
    try target.validate();
    const plan = try @import("parametric_segments.zig").assemble(curve);
    const linear = if (plan.linear) |line| try @import("rational_interval_nearest.zig").candidate(target, try @import("linear_range.zig").build(line)) else null;
    const y = F.WideFraction{ .numerator = target.numerator, .denominator = target.denominator };
    if (linear) |c| if (c.attained and try c.value.order(y) == .eq) return .{ .selected = .{ .rational = y } };
    switch (try @import("power_range_nearest.zig").select(precision, curve, target)) {
        .inactive => return candidates.linearOnly(linear orelse return error.InvalidIccNearestInvariant),
        .undecided => return .undecided,
        .target => return .{ .selected = .{ .rational = y } },
        .endpoint => |p| return if (linear) |c| try candidates.combine(precision, target, c, p) else .{ .selected = .{ .power_endpoint = p } },
    }
}

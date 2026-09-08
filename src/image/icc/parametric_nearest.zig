const F = @import("fraction.zig");
const candidates = @import("parametric_nearest_candidates.zig");
pub const types = @import("parametric_nearest_types.zig");
pub const Result = types.Result;
pub const Target = F.Normalized(128);
pub const Wide = types.Of(512);
pub const WideTarget = F.Normalized(512);
/// Nearest attained output(s) of both clipped branches, not an inverse x policy.
pub fn select(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: Target) !Result {
    return selectFor(128, precision, curve, target);
}
pub fn selectWide(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: WideTarget) !Wide.Result {
    return selectFor(512, precision, curve, target);
}
fn selectFor(comptime bits: u16, comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: F.Normalized(bits)) !types.Of(bits).Result {
    const powerSelect = if (bits == 128) @import("power_range_nearest.zig").select else @import("power_range_nearest.zig").selectWide;
    try target.validate();
    const plan = try @import("parametric_segments.zig").assemble(curve);
    const projection = if (plan.linear) |line| try @import("rational_interval_nearest.zig").project(bits, target, try @import("linear_range.zig").build(line)) else null;
    const y = types.Of(bits).Rational{ .numerator = target.numerator, .denominator = target.denominator };
    const linear = if (projection) |p| switch (p) {
        .target => return .{ .selected = .{ .rational = y } },
        .endpoint => |c| c,
    } else null;
    switch (try powerSelect(precision, curve, target)) {
        .inactive => return candidates.linearFor(bits, linear orelse return error.InvalidIccNearestInvariant),
        .undecided => return .undecided,
        .target => return .{ .selected = .{ .rational = y } },
        .endpoint => |p| return if (linear) |c| try candidates.combineFor(bits, precision, target, c, p) else .{ .selected = .{ .power_endpoint = p } },
    }
}

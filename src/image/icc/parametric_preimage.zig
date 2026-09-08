const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const linear = @import("linear_preimage.zig");
const power = @import("power_preimage.zig");
pub const types = @import("parametric_preimage_types.zig");
pub const Result = types.Result;
/// Complete attained preimage on [0,1], retaining symbolic branch contributions.
/// Does not impose monotonicity, select an inverse, or fill gaps with nearest values.
pub fn solve(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    // Shared solver validates target and the entire real domain, even if inactive.
    const upper = try power.solve(precision, curve, n, d);
    if (upper == .undecided) return .undecided;
    const plan = try segments.assemble(curve);
    return .{ .set = .{
        .linear = if (plan.linear) |branch| try linear.solve(branch, n, d) else null,
        .power = if (upper == .set) upper.set else null,
    } };
}

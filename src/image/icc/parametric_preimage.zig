const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const linear = @import("linear_preimage.zig");
const power = @import("power_preimage.zig");
pub const types = @import("parametric_preimage_types.zig");
pub const Result = types.Result;
pub const Wide = types.Of(512);
/// Complete attained preimage on [0,1], retaining symbolic branch contributions.
/// Does not impose monotonicity, select an inverse, or fill gaps with nearest values.
pub fn solve(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    return solveFor(128, precision, curve, n, d);
}
pub fn solveWide(comptime precision: u16, curve: Curve, n: u512, d: u512) !Wide.Result {
    return solveFor(512, precision, curve, n, d);
}
fn solveFor(comptime bits: u16, comptime precision: u16, curve: Curve, n: @import("std").meta.Int(.unsigned, bits), d: @import("std").meta.Int(.unsigned, bits)) !types.Of(bits).Result {
    const solvePower = if (bits == 128) power.solve else power.solveWide;
    const solveLinear = if (bits == 128) linear.solve else linear.solveWide;
    // Shared solver validates target and the entire real domain, even if inactive.
    const upper = try solvePower(precision, curve, n, d);
    if (upper == .undecided) return .undecided;
    const plan = try segments.assemble(curve);
    return .{ .set = .{
        .linear = if (plan.linear) |branch| try solveLinear(branch, n, d) else null,
        .power = if (upper == .set) upper.set else null,
    } };
}

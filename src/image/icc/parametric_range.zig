const Curve = @import("parametric_curve.zig").Curve;
pub const types = @import("parametric_range_types.zig");
pub const Result = types.Result;
/// Complete clipped output range as a union, retaining gaps and open endpoints.
/// Does not certify invertibility, compare symbolic distances, or select an x.
pub fn build(comptime precision: u16, curve: Curve) !Result {
    const upper = try @import("power_range.zig").build(precision, curve);
    if (upper == .undecided) return .undecided;
    const plan = try @import("parametric_segments.zig").assemble(curve);
    return .{ .set = .{
        .linear = if (plan.linear) |line| try @import("linear_range.zig").build(line) else null,
        .power = if (upper == .range) upper.range else null,
    } };
}

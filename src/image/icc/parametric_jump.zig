const std = @import("std");
const segments = @import("parametric_segments.zig");
const affine = @import("affine_value.zig");
const level = @import("power_level_order.zig");
const rational = @import("rational_power_order.zig");
const Fraction = @import("fraction.zig").Fraction;
pub const Boundary = struct { at: Fraction, order: ?std.math.Order };
pub const Result = union(enum) { none, boundary: Boundary };
fn compare(comptime precision: u16, power: segments.Power, linear: segments.Linear) !?std.math.Order {
    const x = power.interval.start;
    // The linear branch is open here: evaluate its continuous extension, not membership.
    const left = try affine.at(linear.slope, linear.offset, x);
    if (left.numerator <= 0) {
        const raw = (try level.at(precision, power, x, 0)) orelse return null;
        return if (raw == .gt) .gt else .eq;
    }
    if (left.numerator >= @as(i128, @intCast(left.denominator))) {
        const raw = (try level.at(precision, power, x, 65536)) orelse return null;
        return if (raw == .lt) .lt else .eq;
    }
    // For an interior left value, clipping preserves its order relative to the upper value.
    // Fraction components are u64: left.d < 2^80, so offset subtraction fits i128.
    const target_n = left.numerator * 65536 - @as(i128, power.offset) * @as(i128, @intCast(left.denominator));
    const target_d = left.denominator * 65536;
    const base = try affine.at(power.a, power.b, x);
    return rational.compare(precision, base.numerator, base.denominator, power.g, target_n, target_d);
}
/// Order of clipped upper value versus clipped lower left limit at the branch boundary.
/// Whole real-domain validation precedes even the no-boundary result.
/// Does not certify global monotonicity, strictness or invertibility.
pub fn inspect(comptime precision: u16, curve: @import("parametric_curve.zig").Curve) !Result {
    const plan = try segments.assemble(curve);
    const power = plan.power orelse return .none;
    const linear = plan.linear orelse return .none;
    return .{ .boundary = .{ .at = power.interval.start, .order = try compare(precision, power, linear) } };
}

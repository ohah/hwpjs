const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
pub const Rational = F.WideFraction;
/// Compare |value-target| with |r-target|. Does not decide attainment or tie policy.
pub fn compare(comptime precision: u16, value: @import("power_ordinate.zig").Value, r: F.WideFraction, target: Target) !?std.math.Order {
    const band = try @import("ordinate_distance_band.zig").build(target, r);
    const p = switch (value) {
        .rational => |v| return try @import("ordinate_distance.zig").compare(target, v, r),
        .power => |p| p,
    };
    const C = @import("power_ordinate_rational_order.zig").Of(384);
    const lower = try C.compare(precision, p, band.lower, band.denominator);
    if (lower == .lt) return .gt;
    if (lower == .eq) return .eq;
    const upper = try C.compare(precision, p, band.upper, band.denominator);
    if (upper == .gt) return .gt;
    if (upper == .eq) return .eq;
    if (lower == null or upper == null) return null;
    return .lt;
}

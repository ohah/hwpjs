const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
pub const WideTarget = F.Normalized(512);
pub const Rational = F.WideFraction;
/// Compare |value-target| with |r-target|. Does not decide attainment or tie policy.
pub fn compare(comptime precision: u16, value: @import("power_ordinate.zig").Value, r: F.WideFraction, target: Target) !?std.math.Order {
    return compareFor(128, precision, value, r, target);
}
pub fn compareWide(comptime precision: u16, value: @import("power_ordinate.zig").Value, r: F.WideFraction, target: WideTarget) !?std.math.Order {
    return compareFor(512, precision, value, r, target);
}
fn compareFor(comptime bits: u16, comptime precision: u16, value: @import("power_ordinate.zig").Value, r: F.WideFraction, target: F.Normalized(bits)) !?std.math.Order {
    const build = if (bits == 128) @import("ordinate_distance_band.zig").build else @import("ordinate_distance_band.zig").buildWide;
    const compareRational = if (bits == 128) @import("ordinate_distance.zig").compare else @import("ordinate_distance.zig").compareWide;
    const band = try build(target, r);
    const p = switch (value) {
        .rational => |v| return try compareRational(target, v, r),
        .power => |p| p,
    };
    const C = @import("power_ordinate_rational_order.zig").Of(bits + 256);
    const lower = try C.compare(precision, p, band.lower, band.denominator);
    if (lower == .lt) return .gt;
    if (lower == .eq) return .eq;
    const upper = try C.compare(precision, p, band.upper, band.denominator);
    if (upper == .gt) return .gt;
    if (upper == .eq) return .eq;
    if (lower == null or upper == null) return null;
    return .lt;
}

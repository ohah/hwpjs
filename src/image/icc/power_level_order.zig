const std = @import("std");
const Power = @import("parametric_segments.zig").Power;
const Fraction = @import("fraction.zig").Fraction;
const level = @import("power_level.zig");
/// Unclipped power value relative to a raw signed 16.16 target at an included point.
/// Validates this point's real domain; entire-branch validation belongs to the assembler.
pub fn at(comptime precision: u16, power: Power, x: Fraction, target: i32) !?std.math.Order {
    if (!try power.interval.contains(x)) return error.OutsideIccPowerInterval;
    const base = try @import("affine_value.zig").at(power.a, power.b, x);
    const exponent = @import("fixed16_exponent.zig").classify(power.g);
    if (base.numerator == 0) {
        if (power.g <= 0) return error.UndefinedIccCurvePower;
        return std.math.order(power.offset, target);
    }
    if (base.numerator < 0 and exponent == .fractional) return error.UndefinedIccCurvePower;
    if (power.g == 0) return std.math.order(@as(i64, power.offset) + 65536, @as(i64, target));
    const negative = base.numerator < 0;
    const negative_value = negative and exponent == .odd_integer;
    const ordinate = @as(i64, target) - power.offset;
    if (ordinate == 0 or (ordinate < 0) != negative_value) return if (negative_value) .lt else .gt;
    const roots = level.solve(power.g, power.offset, target).finite;
    for (roots.roots[0..roots.count]) |root| {
        if (root != .nonzero or root.nonzero.negative != negative) continue;
        const order = (try @import("power_root_compare.zig").compare(precision, root, base.numerator, base.denominator)) orelse return null;
        // Sign of d(z^g)/dz = sign(g) * sign(z) * sign(z^g).
        const increasing = (power.g > 0) != (negative != negative_value);
        return if (increasing) order.invert() else order;
    }
    return error.InvalidIccPowerLevelInvariant;
}

const std = @import("std");
const bounds = @import("positive_bounds.zig");
const equality = @import("rational_power_equality.zig");
/// Compare (base_n/base_d)^(g/65536) with target_n/target_d, without rounding.
/// No offset, clipping or interval policy. null means insufficient precision.
pub fn compare(comptime precision: u16, base_n: i128, base_d: u128, g: i32, target_n: i128, target_d: u128) !?std.math.Order {
    if (base_d == 0 or target_d == 0) return error.InvalidIccPowerCoordinate;
    if (base_n == 0) {
        if (g <= 0) return error.UndefinedIccCurvePower;
        return std.math.order(@as(i128, 0), target_n);
    }
    const exponent = @import("fixed16_exponent.zig").classify(g);
    if (base_n < 0 and exponent == .fractional) return error.UndefinedIccCurvePower;
    if (g == 0) {
        if (target_n <= 0) return .gt;
        return std.math.order(target_d, @as(u128, @intCast(target_n)));
    }
    const negative = base_n < 0 and exponent == .odd_integer;
    if (target_n == 0 or negative != (target_n < 0)) return if (negative) .lt else .gt;
    const a = if (g < 0) base_d else @abs(base_n);
    const b = if (g < 0) @abs(base_n) else base_d;
    const p = @abs(g);
    const n = @abs(target_n);
    if (equality.matches(a, b, p, 65536, n, target_d)) return .eq;
    const A = bounds.Arithmetic(precision);
    const left = try A.power(try A.fraction(a, b), p);
    const right = try A.power(try A.fraction(n, target_d), 65536);
    const order = A.separated(left, right) orelse return null;
    return if (negative) order.invert() else order;
}

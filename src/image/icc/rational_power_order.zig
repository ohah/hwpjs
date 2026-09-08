const std = @import("std");
const bounds = @import("positive_bounds.zig");
/// Backward-compatible signed i128/u128 comparison.
pub fn compare(comptime precision: u16, base_n: i128, base_d: u128, g: i32, target_n: i128, target_d: u128) !?std.math.Order {
    return Of(128).compare(precision, base_n, base_d, g, target_n, target_d);
}
/// Compare a rational power with a signed rational, without rounding.
pub fn Of(comptime bits: u16) type {
    const I = switch (bits) {
        128 => i128,
        256 => i256,
        else => @compileError("power order width must be 128 or 256"),
    };
    const U = std.meta.Int(.unsigned, bits);
    const equality = @import("rational_power_equality.zig").Of(bits);
    return struct {
        pub fn compare(comptime precision: u16, base_n: I, base_d: U, g: i32, target_n: I, target_d: U) !?std.math.Order {
            if (base_d == 0 or target_d == 0) return error.InvalidIccPowerCoordinate;
            if (base_n == 0) {
                if (g <= 0) return error.UndefinedIccCurvePower;
                return std.math.order(@as(I, 0), target_n);
            }
            const exponent = @import("fixed16_exponent.zig").classify(g);
            if (base_n < 0 and exponent == .fractional) return error.UndefinedIccCurvePower;
            if (g == 0) {
                if (target_n <= 0) return .gt;
                return std.math.order(target_d, @as(U, @intCast(target_n)));
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
    };
}

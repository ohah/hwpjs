const std = @import("std");
/// Signed rational thresholds, including reflections outside [0,1].
/// Offset subtraction is shared by normalized-value and distance comparisons.
pub fn Of(comptime width: u16) type {
    const working = switch (width) {
        128 => 256,
        384 => 512,
        512 => 1024,
        else => @compileError("unsupported ordinate threshold width"),
    };
    const I = std.meta.Int(.signed, width + 2);
    const U = std.meta.Int(.unsigned, width);
    const W = std.meta.Int(.signed, working);
    const V = std.meta.Int(.unsigned, working);
    return struct {
        pub fn compare(comptime precision: u16, power: @import("power_ordinate.zig").PowerValue, n: I, d: U) !?std.math.Order {
            if (d == 0) return error.InvalidIccPowerCoordinate;
            // Signed width+33 and unsigned width+16 bits suffice.
            const shifted = @as(W, 65536) * n - @as(W, power.offset) * d;
            const denominator = @as(V, 65536) * d;
            return @import("rational_power_order.zig").Of(working).compare(precision, power.base.numerator, power.base.denominator, power.g, shifted, denominator);
        }
    };
}

const std = @import("std");

/// Recover rational samples by exact cancellation, never by rounding an
/// approximate value toward a nearby tie. cos(k*pi/16), k=0..7, are linearly
/// independent over Q. i128 holds at most 128 signed i64 contributions.
pub fn at(coefficients: *const [64]i64, x: usize, y: usize) ?f64 {
    std.debug.assert(x < 8 and y < 8);
    var sums: [8]i128 = @splat(0);
    for (coefficients, 0..) |value, index| {
        if (value == 0) continue;
        const u = index % 8;
        const v = index / 8;
        // C(0) = cos(pi/4); otherwise C(u) = 1. The two cosines
        // multiply to (cos(a+b) + cos(a-b))/2, followed by IDCT's /4.
        const a: i16 = if (u == 0) 4 else @intCast((2 * x + 1) * u);
        const b: i16 = if (v == 0) 4 else @intCast((2 * y + 1) * v);
        add(&sums, a + b, value);
        add(&sums, a - b, value);
    }
    for (sums[1..]) |value| if (value != 0) return null;
    return @as(f64, @floatFromInt(sums[0])) / 8;
}

fn add(sums: *[8]i128, angle: i16, coefficient: i128) void {
    var k = @mod(angle, 32);
    var value = coefficient;
    if (k > 16) k = 32 - k;
    if (k > 8) {
        k = 16 - k;
        value = -value;
    }
    if (k != 8) sums[@intCast(k)] += value;
}

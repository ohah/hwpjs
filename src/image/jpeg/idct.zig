const std = @import("std");

// T.81 A.3.3, including the C(0) and 1/2 factors in each dimension.
const basis: [8][8]f64 = blk: {
    var result: [8][8]f64 = undefined;
    for (0..8) |sample| for (0..8) |frequency| {
        const c: f64 = if (frequency == 0) 1.0 / @sqrt(@as(f64, 2)) else 1;
        const angle = @as(f64, @floatFromInt((2 * sample + 1) * frequency)) * std.math.pi / 16;
        result[sample][frequency] = c * @cos(angle) / 2;
    };
    break :blk result;
};

/// Separable f64 IDCT of a row-major dequantized coefficient block.
/// Output remains centered and fractional: level shift and sample rounding are
/// separate. No allocation, integer truncation, or pixel clamping occurs here.
pub fn transform(coefficients: [64]i64) [64]f64 {
    @setFloatMode(.strict);
    var dc_only = true;
    for (coefficients[1..]) |value| if (value != 0) {
        dc_only = false;
        break;
    };
    // Avoid a sqrt(2) round-off at exact half-sample DC boundaries.
    if (dc_only) return @splat(@as(f64, @floatFromInt(coefficients[0])) / 8);
    var horizontal: [64]f64 = undefined;
    for (0..8) |v| for (0..8) |x| {
        var value: f64 = 0;
        for (0..8) |u| value += @as(f64, @floatFromInt(coefficients[v * 8 + u])) * basis[x][u];
        horizontal[v * 8 + x] = value;
    };
    var result: [64]f64 = undefined;
    for (0..8) |y| for (0..8) |x| {
        var value: f64 = 0;
        for (0..8) |v| value += horizontal[v * 8 + x] * basis[y][v];
        result[y * 8 + x] = value;
    };
    return result;
}

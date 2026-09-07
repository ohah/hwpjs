const Curve = @import("parametric_curve.zig").Curve;
const math = @import("curve_math.zig");
/// ICC.1:2022 Table 68. Evaluates one point; does not certify the whole curve.
pub fn evaluate(curve: Curve, x: f64) !f64 {
    @setFloatMode(.strict);
    try math.coordinate(x);
    var p: [7]f64 = @splat(0);
    for (curve.values[0..curve.function.count()], 0..) |v, i| p[i] = @as(f64, @floatFromInt(v)) / 65536;
    const g = p[0];
    const a = p[1];
    const c = p[3];
    const d = p[4];
    const e = p[5];
    const f = p[6];
    // One rounding for the affine term. Avoid comparing x to a separately
    // rounded -b/a at type1/2 boundaries.
    const base = @mulAdd(f64, a * 65536, x, p[2] * 65536);
    const y = switch (curve.function) {
        .type0 => try math.power(x, g),
        .type1, .type2 => blk: {
            if (a == 0) return error.UndefinedIccCurveThreshold;
            const offset: f64 = if (curve.function == .type2) c else 0;
            const upper = if (a > 0) base >= 0 else base <= 0;
            break :blk if (upper) (try math.fixed16Power(base, g)) + offset else offset;
        },
        .type3 => if (x >= d) try math.fixed16Power(base, g) else c * x,
        .type4 => if (x >= d) (try math.fixed16Power(base, g)) + e else @mulAdd(f64, c, x, f),
    };
    return math.clip(y);
}

const math = @import("curve_math.zig");
/// ICC 10.6 / Annex F.1: inverse of y = x^(raw/256), not a new wire gamma.
/// Approximate f64 evaluation. The model layer owns signed coordinate clipping.
pub fn evaluate(raw: u16, y: f64) !f64 {
    @setFloatMode(.strict);
    try math.coordinate(y);
    // Gamma zero is constant on (0,1] and undefined at zero under our power policy.
    // It has no inverse, including for a query at an otherwise defined point.
    if (raw == 0) return error.NonInvertibleIccGamma;
    if (raw == 256) return y;
    return math.clip(try math.power(y, 256 / @as(f64, @floatFromInt(raw))));
}

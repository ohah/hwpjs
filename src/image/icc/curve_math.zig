const std = @import("std");
/// Numeric policy for evaluation only, not raw tag validity.
pub fn coordinate(x: f64) !void {
    @setFloatMode(.strict);
    if (!std.math.isFinite(x) or x < 0 or x > 1) return error.InvalidIccCurveCoordinate;
}
pub fn power(base: f64, exponent: f64) !f64 {
    @setFloatMode(.strict);
    // Deliberately leave 0^0 undefined instead of inheriting a libm convention.
    if (base == 0 and exponent <= 0) return error.UndefinedIccCurvePower;
    if (base < 0 and @trunc(exponent) != exponent) return error.UndefinedIccCurvePower;
    return std.math.pow(f64, base, exponent);
}
pub fn clip(y: f64) !f64 {
    @setFloatMode(.strict);
    if (std.math.isNan(y)) return error.UndefinedIccCurvePower;
    // Finite encoded coefficients cannot cancel a power overflow back into range.
    return if (y <= 0) 0 else if (y >= 1) 1 else y;
}
/// The affine term is kept in encoded fixed16 units until exponentiation.
/// This preserves its sign even when dividing by 65536 would underflow to zero.
pub fn fixed16Power(raw_base: f64, exponent: f64) !f64 {
    @setFloatMode(.strict);
    if (raw_base < 0 and @trunc(exponent) != exponent) return error.UndefinedIccCurvePower;
    const base = raw_base / 65536;
    if (@abs(base) >= std.math.floatMin(f64) or raw_base == 0) return power(base, exponent);
    const magnitude = std.math.pow(f64, 2, exponent * (@log2(@abs(raw_base)) - 16));
    return if (raw_base < 0 and @mod(exponent, 2) != 0) -magnitude else magnitude;
}

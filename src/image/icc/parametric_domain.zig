const Curve = @import("parametric_curve.zig").Curve;
const Fraction = @import("fraction.zig").Fraction;
/// Closed active power interval [start,1]. Coefficients remain signed 16.16.
pub const PowerDomain = struct { start: Fraction, a: i32, b: i32, g: i32 };
/// Table 68's power branch, intersected with [0,1], without f64 thresholds.
/// null means that only the affine/constant lower branch is active.
pub fn powerDomain(curve: Curve) !?PowerDomain {
    const p = curve.values;
    var n: i64 = 0;
    var d: i64 = 1;
    switch (curve.function) {
        .type0 => {},
        .type1, .type2 => {
            const threshold = @import("affine_root.zig").unrestricted(p[1], p[2], 0) orelse return error.UndefinedIccCurveThreshold;
            n = threshold.numerator;
            d = threshold.denominator;
        },
        .type3, .type4 => {
            n = p[4];
            d = 65536;
        },
    }
    if (n > d) return null;
    return .{
        .start = if (n <= 0) .{ .numerator = 0, .denominator = 1 } else .{ .numerator = @intCast(n), .denominator = @intCast(d) },
        .a = if (curve.function == .type0) 65536 else p[1],
        .b = if (curve.function == .type0) 0 else p[2],
        .g = p[0],
    };
}
/// Real-valued definition over the entire domain, under curve_math's 0^0 policy.
/// Does not certify monotonicity, continuity, nonconstancy or invertibility.
pub fn validate(curve: Curve) !void {
    const power = (try powerDomain(curve)) orelse return;
    const start = @as(i128, power.a) * power.start.numerator + @as(i128, power.b) * power.start.denominator;
    const end = @as(i64, power.a) + power.b;
    // A linear base takes its extreme values at the closed interval endpoints.
    if (@import("fixed16_exponent.zig").classify(power.g) == .fractional and (start < 0 or end < 0)) return error.UndefinedIccCurvePower;
    const contains_zero = start == 0 or end == 0 or (start < 0 and end > 0) or (start > 0 and end < 0);
    if (power.g <= 0 and contains_zero) return error.UndefinedIccCurvePower;
}

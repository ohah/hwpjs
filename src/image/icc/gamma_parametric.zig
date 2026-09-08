/// Exact u8.8 -> s15.16 exponent conversion, for invertible gamma curves only.
pub fn curve(raw: u16) !@import("parametric_curve.zig").Curve {
    if (raw == 0) return error.NonInvertibleIccGamma;
    return .{ .function = .type0, .values = .{ @as(i32, raw) * 256, 0, 0, 0, 0, 0, 0 } };
}

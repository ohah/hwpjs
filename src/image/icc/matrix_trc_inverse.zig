pub const Evaluation = @import("matrix_trc_inverse_types.zig").Evaluation;
/// Signed 16.16 real XYZ input, NOT the unsigned 16-bit PCSXYZ wire encoding.
/// Exact fixed-input F.3 evaluation. No float conversion or automatic LUT choice.
pub fn evaluateFixed(comptime precision: u16, model: @import("matrix_trc_model.zig").Model, xyz: [3]i32) !Evaluation {
    const linear = try @import("matrix3_transform.zig").inverse(model.coefficients, xyz);
    var result = Evaluation{ .linear = linear, .clipping = undefined, .device = undefined };
    for (linear.numerators, 0..) |n, i| {
        const normalized = try @import("linear_rgb_target.zig").normalize(n, linear.denominator);
        result.clipping[i] = normalized.clipping;
        result.device[i] = try @import("trc_inverse.zig").select(precision, model.curves[i], normalized.target);
    }
    return result;
}

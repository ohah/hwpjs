pub const types = @import("matrix_trc_inverse_types.zig");
pub const Evaluation = types.Evaluation;
pub const Wide = types.Of(512);
pub const FractionInput = @import("matrix3_fraction_inverse.zig").Input;
/// Signed 16.16 real XYZ input, NOT the unsigned 16-bit PCSXYZ wire encoding.
/// Exact fixed-input F.3 evaluation. No float conversion or automatic LUT choice.
pub fn evaluateFixed(comptime precision: u16, model: @import("matrix_trc_model.zig").Model, xyz: [3]i32) !Evaluation {
    const linear = try @import("matrix3_transform.zig").inverse(model.coefficients, xyz);
    return finish(128, precision, model, linear);
}
/// Exact real XYZ fractions; preserve signed linear results before F.3 clipping.
pub fn evaluateFraction(comptime precision: u16, model: @import("matrix_trc_model.zig").Model, xyz: FractionInput) !Wide.Evaluation {
    const linear = try @import("matrix3_fraction_inverse.zig").inverse(model.coefficients, xyz);
    return finish(512, precision, model, linear);
}
fn finish(comptime bits: u16, comptime precision: u16, model: @import("matrix_trc_model.zig").Model, linear: anytype) !types.Of(bits).Evaluation {
    const select = if (bits == 128) @import("trc_inverse.zig").select else @import("trc_inverse.zig").selectWide;
    var result = types.Of(bits).Evaluation{ .linear = linear, .clipping = undefined, .device = undefined };
    for (linear.numerators, 0..) |n, i| {
        const normalized = try @import("linear_rgb_target.zig").Of(bits).normalize(n, linear.denominator);
        result.clipping[i] = normalized.clipping;
        result.device[i] = try select(precision, model.curves[i], normalized.target);
    }
    return result;
}

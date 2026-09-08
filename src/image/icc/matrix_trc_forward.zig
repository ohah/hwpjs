const trc = @import("trc_forward.zig");
const exact_matrix = @import("matrix3_fraction.zig");
pub const Result = union(enum) { exact: exact_matrix.ExactVector, approximate: [3]f64 };
pub const Evaluation = struct {
    xyz: Result,
    profile_semantics_deferred: bool = true,
    transform_priority_deferred: bool = true,
};
/// ICC Annex F.3 point evaluation, not LUT selection or PCS byte encoding.
pub fn evaluate(model: @import("matrix_trc_model.zig").Model, input: [3]trc.Fraction) !Evaluation {
    var linear: [3]trc.Result = undefined;
    var all_exact = true;
    for (input, 0..) |x, i| {
        linear[i] = try trc.evaluate(model.curves[i], x);
        if (linear[i] == .approximate) all_exact = false;
    }
    if (all_exact) {
        const values = [3]trc.Fraction{ linear[0].exact, linear[1].exact, linear[2].exact };
        return .{ .xyz = .{ .exact = try exact_matrix.forward(model.coefficients, values) } };
    }
    var values: [3]f64 = undefined;
    for (linear, 0..) |x, i| values[i] = switch (x) {
        .exact => |f| try f.toFloat(),
        .approximate => |f| f,
    };
    return .{ .xyz = .{ .approximate = try @import("matrix3_float.zig").forward(model.coefficients, values) } };
}

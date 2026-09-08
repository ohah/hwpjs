const std = @import("std");
const t = std.testing;
const evaluate = @import("matrix_trc_forward.zig").evaluate;
const Model = @import("matrix_trc_model.zig").Model;
const Fraction = @import("fraction.zig").Fraction;
const identity = [9]i32{ 65536, 0, 0, 0, 65536, 0, 0, 0, 65536 };
fn model() Model {
    return .{ .coefficients = identity, .curves = @splat(.{ .curve_type = .identity }) };
}
test "matrix TRC forward preserves full-width fractions without quantization" {
    const max = std.math.maxInt(u64);
    const input = [3]Fraction{ .{ .numerator = max - 1, .denominator = max }, .{ .numerator = 1, .denominator = max - 1 }, .{ .numerator = 2, .denominator = max - 2 } };
    const result = try evaluate(model(), input);
    try t.expect(result.xyz == .exact);
    const exact = result.xyz.exact;
    try t.expect(exact.denominator > std.math.maxInt(u128));
    const denominator: i256 = @intCast(exact.denominator);
    for (input, exact.numerators) |x, n| try t.expectEqual(@as(i256, x.numerator) * @divExact(denominator, x.denominator), n);
    try t.expect(result.profile_semantics_deferred and result.transform_priority_deferred);
}
test "matrix TRC forward connects sampled channels and retains unclipped XYZ" {
    var m = model();
    const samples = [_]u8{ 0, 0, 255, 255 };
    m.curves[1] = .{ .curve_type = .{ .samples = .{ .data = &samples } } };
    m.coefficients = .{ -65536, 131072, 0, 0, 65536, 0, 0, 0, 196608 };
    const result = try evaluate(m, .{ .{ .numerator = 1, .denominator = 1 }, .{ .numerator = 0, .denominator = 1 }, .{ .numerator = 1, .denominator = 1 } });
    const exact = result.xyz.exact;
    const d: i256 = @intCast(exact.denominator);
    try t.expectEqualDeep([3]i256{ -d, 0, 3 * d }, exact.numerators);
}
test "matrix TRC forward labels mixed analytic results and propagates input errors" {
    var m = model();
    m.curves[1] = .{ .curve_type = .{ .gamma = 512 } };
    const half = Fraction{ .numerator = 1, .denominator = 2 };
    const result = try evaluate(m, @splat(half));
    try t.expectEqualDeep([3]f64{ 0.5, 0.25, 0.5 }, result.xyz.approximate);
    try t.expectError(error.InvalidIccCurveCoordinate, evaluate(m, .{ half, .{ .numerator = 1, .denominator = 0 }, half }));
}
test "approximate matrix rejects nonfinite inputs and overflowing outputs" {
    const forward = @import("matrix3_float.zig").forward;
    try t.expectError(error.InvalidIccMatrixCoordinate, forward(identity, .{ std.math.nan(f64), 0, 0 }));
    try t.expectError(error.InvalidIccMatrixCoordinate, forward(identity, .{ 0, std.math.inf(f64), 0 }));
    try t.expectError(error.InvalidIccMatrixResult, forward(@splat(std.math.maxInt(i32)), @splat(std.math.floatMax(f64))));
}

const std = @import("std");
const t = std.testing;
const api = @import("matrix_trc_inverse.zig");
const Model = @import("matrix_trc_model.zig").Model;
fn model() Model {
    return .{ .coefficients = .{ 65536, 0, 0, 0, 65536, 0, 0, 0, 65536 }, .curves = @splat(.{ .curve_type = .identity }) };
}
fn expectRatio(result: @import("trc_inverse.zig").Wide.Result, n: u1024, d: u1024) !void {
    try t.expect(result == .selected);
    try t.expect(result.selected == .rational);
    const r = result.selected.rational;
    try t.expect(r.denominator > 0);
    try t.expectEqual(@as(u2048, n) * r.denominator, @as(u2048, r.numerator) * d);
}
test "fraction matrix TRC retains large fractions and clips only after mixing" {
    var m = model();
    const max = std.math.maxInt(u256);
    const half = std.math.maxInt(i256);
    const r = try api.evaluateFraction(512, m, .{ .numerators = .{ half, 1, 0 }, .denominator = max });
    try t.expect(r.linear.denominator > max);
    try expectRatio(r.device[0], half, max);
    try expectRatio(r.device[1], 1, max);
    try expectRatio(r.device[2], 0, 1);
    try t.expectEqualDeep([3]@import("linear_rgb_target.zig").Clipping{ .none, .none, .none }, r.clipping);
    m.coefficients[1] = 65536;
    const mixed = try api.evaluateFraction(512, m, .{ .numerators = .{ 1, 2, -1 }, .denominator = 1 });
    const d: i512 = @intCast(mixed.linear.denominator);
    try t.expectEqualDeep([3]i512{ -d, 2 * d, -d }, mixed.linear.numerators);
    try t.expectEqualDeep([3]@import("linear_rgb_target.zig").Clipping{ .below, .above, .below }, mixed.clipping);
    try expectRatio(mixed.device[0], 0, 1);
    try expectRatio(mixed.device[1], 1, 1);
    try t.expect(mixed.profile_semantics_deferred and mixed.transform_priority_deferred);
}
test "fraction matrix TRC preserves channel dispatch after endpoint clipping" {
    var m = model();
    const samples = [_]u8{ 0, 0, 0, 0, 255, 255, 255, 255 };
    m.curves[0] = .{ .curve_type = .{ .samples = .{ .data = &samples } } };
    m.curves[1] = .{ .curve_type = .{ .gamma = 512 } };
    m.coefficients[8] = -65536;
    const r = try api.evaluateFraction(512, m, .{ .numerators = .{ -4, 1, -2 }, .denominator = 4 });
    try expectRatio(r.device[0], 1, 3);
    try expectRatio(r.device[2], 1, 2);
    try t.expect(r.device[1] == .selected);
    try t.expect(r.device[1].selected == .power_root);
    const p = r.device[1].selected.power_root;
    const order = try @import("normalized_power_root_compare.zig").Wide.at(512, p.root, p.a, p.b, .{ .numerator = 1, .denominator = 2 });
    try t.expect(order != null);
    try t.expectEqual(.eq, order.?);
}
test "fraction matrix TRC carries missing and ambiguous states and later errors" {
    var m = model();
    m.curves[0] = .{ .parametric = .{ .function = .type4, .values = .{ 65536, 0, 0, 0, 32768, 65536, 0 } } };
    m.curves[1] = .{ .parametric = .{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } } };
    const xyz = api.FractionInput{ .numerators = .{ 4, 5, 2 }, .denominator = 8 };
    const r = try api.evaluateFraction(512, m, xyz);
    try t.expect(r.device[0] == .ambiguous);
    try t.expect(r.device[1] == .unattained);
    try expectRatio(r.device[2], 1, 4);
    m.curves[2] = .{ .curve_type = .{ .gamma = 0 } };
    try t.expectError(error.NonInvertibleIccGamma, api.evaluateFraction(512, m, xyz));
    m.coefficients = @splat(0);
    try t.expectError(error.InvalidIccAdaptationSingular, api.evaluateFraction(512, m, xyz));
    try t.expectError(error.InvalidIccMatrixCoordinate, api.evaluateFraction(512, m, .{ .numerators = @splat(0), .denominator = 0 }));
}

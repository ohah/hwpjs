const std = @import("std");
const t = std.testing;
const evaluate = @import("matrix_trc_inverse.zig").evaluateFixed;
const Model = @import("matrix_trc_model.zig").Model;
fn model() Model {
    return .{ .coefficients = .{ 65536, 0, 0, 0, 65536, 0, 0, 0, 65536 }, .curves = @splat(.{ .curve_type = .identity }) };
}
fn expectX(result: @import("trc_inverse.zig").Result, n: u64, d: u64) !void {
    const order = switch (result.selected) {
        .rational => |r| try r.order(.{ .numerator = n, .denominator = d }),
        .power_root => |r| (try @import("normalized_power_root_compare.zig").at(512, r.root, r.a, r.b, .{ .numerator = n, .denominator = d })).?,
    };
    try t.expectEqual(.eq, order);
}
test "linear RGB clipping validates denominator and preserves full-width fractions" {
    const normalize = @import("linear_rgb_target.zig").normalize;
    try t.expectError(error.InvalidIccMatrixCoordinate, normalize(-1, 0));
    try t.expectEqual(.below, (try normalize(std.math.minInt(i128), 1)).clipping);
    try t.expectEqual(.above, (try normalize(2, 1)).clipping);
    const max = std.math.maxInt(u128);
    const wide = try normalize(std.math.maxInt(i128), max);
    try t.expectEqual(.none, wide.clipping);
    try t.expectEqual(max, wide.target.denominator);
    try t.expectEqual(@as(u128, std.math.maxInt(i128)), wide.target.numerator);
    try t.expectEqual(.none, (try normalize(0, 1)).clipping);
    try t.expectEqual(.none, (try normalize(1, 1)).clipping);
}
test "matrix inverse clips after mixing and retains raw signed linear RGB" {
    var m = model();
    m.coefficients = .{ 65536, 65536, 0, 0, 65536, 0, 0, 0, 65536 };
    const r = try evaluate(512, m, .{ 65536, 131072, -65536 });
    const d: i128 = @intCast(r.linear.denominator);
    try t.expectEqualDeep([3]i128{ -d, 2 * d, -d }, r.linear.numerators);
    try t.expectEqual(.below, r.clipping[0]);
    try t.expectEqual(.above, r.clipping[1]);
    try t.expectEqual(.below, r.clipping[2]);
    try expectX(r.device[0], 0, 1);
    try expectX(r.device[1], 1, 1);
    try expectX(r.device[2], 0, 1);
    try t.expect(r.profile_semantics_deferred and r.transform_priority_deferred);
}
test "matrix inverse dispatches distinct channels without endpoint shortcuts" {
    var m = model();
    const samples = [_]u8{ 0, 0, 0, 0, 255, 255, 255, 255 };
    m.curves[0] = .{ .curve_type = .{ .samples = .{ .data = &samples } } };
    m.curves[1] = .{ .curve_type = .{ .gamma = 512 } };
    m.coefficients[8] = -65536;
    const r = try evaluate(512, m, .{ -65536, 16384, -32768 });
    try expectX(r.device[0], 1, 3);
    try expectX(r.device[1], 1, 2);
    try expectX(r.device[2], 1, 2);
    const end = try evaluate(512, m, .{ 131072, 65536, 0 });
    try expectX(end.device[0], 2, 3);
}
test "matrix inverse preserves ambiguity and unattained per channel and rejects later invalid curves" {
    var m = model();
    m.curves[0] = .{ .parametric = .{ .function = .type4, .values = .{ 65536, 0, 0, 0, 32768, 65536, 0 } } };
    m.curves[1] = .{ .parametric = .{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } } };
    const r = try evaluate(512, m, .{ 32768, 40960, 16384 });
    try t.expect(r.device[0] == .ambiguous);
    try t.expect(r.device[1] == .unattained);
    try expectX(r.device[2], 1, 4);
    m.curves[2] = .{ .curve_type = .{ .gamma = 0 } };
    try t.expectError(error.NonInvertibleIccGamma, evaluate(512, m, .{ 32768, 40960, 16384 }));
    m.coefficients = @splat(0);
    try t.expectError(error.InvalidIccAdaptationSingular, evaluate(512, m, @splat(0)));
}

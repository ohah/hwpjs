const std = @import("std");
const select = @import("trc_inverse.zig").select;
fn expectX(result: @import("trc_inverse.zig").Result, n: u64, d: u64) !void {
    const coordinate = result.selected;
    const order = switch (coordinate) {
        .rational => |r| try r.order(.{ .numerator = n, .denominator = d }),
        .power_root => |r| (try @import("normalized_power_root_compare.zig").at(512, r.root, r.a, r.b, .{ .numerator = n, .denominator = d })).?,
    };
    try std.testing.expectEqual(.eq, order);
}
test "TRC inverse retains wide identity and sampled plateau rules" {
    const max = std.math.maxInt(u128);
    const identity = (try select(128, .{ .curve_type = .identity }, .{ .numerator = max - 1, .denominator = max })).selected.rational;
    try std.testing.expectEqual(@as(u256, max - 1), identity.numerator);
    try std.testing.expectEqual(@as(u256, max), identity.denominator);
    const data = [_]u8{ 0, 0, 0, 0, 255, 255, 255, 255 };
    const curve = @import("trc_tag.zig").Curve{ .curve_type = .{ .samples = .{ .data = &data } } };
    try expectX(try select(128, curve, .{ .numerator = 0, .denominator = 1 }), 1, 3);
    try expectX(try select(128, curve, .{ .numerator = 1, .denominator = 1 }), 2, 3);
    try expectX(try select(128, curve, .{ .numerator = 1, .denominator = 2 }), 1, 2);
}
test "TRC gamma inversion uses exact exponent conversion including extreme gamma" {
    try expectX(try select(512, .{ .curve_type = .{ .gamma = 512 } }, .{ .numerator = 1, .denominator = 4 }), 1, 2);
    try expectX(try select(512, .{ .curve_type = .{ .gamma = 256 } }, .{ .numerator = 1, .denominator = 3 }), 1, 3);
    try std.testing.expectEqual(@as(i32, 16776960), (try @import("gamma_parametric.zig").curve(65535)).values[0]);
    const tiny = (try select(512, .{ .curve_type = .{ .gamma = 1 } }, .{ .numerator = 1, .denominator = 2 })).selected.power_root;
    try std.testing.expectEqual(.lt, (try @import("normalized_power_root_compare.zig").at(512, tiny.root, tiny.a, tiny.b, .{ .numerator = 1, .denominator = @as(u64, 1) << 63 })).?);
    try std.testing.expectError(error.NonInvertibleIccGamma, select(128, .{ .curve_type = .{ .gamma = 0 } }, .{ .numerator = 1, .denominator = 2 }));
}
test "TRC parametric preserves missing output ambiguity and terminal plateau" {
    var p = @import("parametric_curve.zig").Curve{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } };
    try std.testing.expect((try select(512, .{ .parametric = p }, .{ .numerator = 3, .denominator = 5 })) == .unattained);
    p.values[3] = 0;
    try std.testing.expect((try select(512, .{ .parametric = p }, .{ .numerator = 1, .denominator = 2 })) == .ambiguous);
    try expectX(try select(512, .{ .parametric = p }, .{ .numerator = 1, .denominator = 1 }), 1, 2);
}
test "TRC inverse validates normalized targets and complete sample curves" {
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(128, .{ .curve_type = .identity }, .{ .numerator = 0, .denominator = 0 }));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(128, .{ .curve_type = .{ .gamma = 0 } }, .{ .numerator = 2, .denominator = 1 }));
    const malformed = [_]u8{ 0, 0, 1 };
    try std.testing.expectError(error.InvalidIccInverseSamples, select(128, .{ .curve_type = .{ .samples = .{ .data = &malformed } } }, .{ .numerator = 0, .denominator = 1 }));
    const nonmonotonic = [_]u8{ 0, 0, 255, 255, 0, 0 };
    try std.testing.expectError(error.NonMonotonicIccCurve, select(128, .{ .curve_type = .{ .samples = .{ .data = &nonmonotonic } } }, .{ .numerator = 0, .denominator = 1 }));
}

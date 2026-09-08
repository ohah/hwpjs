const std = @import("std");
const t = std.testing;
const api = @import("trc_inverse.zig");

fn rational(result: api.Wide.Result) !api.Wide.Coordinate {
    try t.expect(result == .selected);
    try t.expect(result.selected == .rational);
    return result.selected;
}

test "wide TRC preserves full identity and sampled coordinates" {
    const max = std.math.maxInt(u512);
    const target = api.Wide.Target{ .numerator = max - 1, .denominator = max };
    const identity = (try rational(try api.selectWide(128, .{ .curve_type = .identity }, target))).rational;
    try t.expectEqual(@as(u1024, max - 1), identity.numerator);
    try t.expectEqual(@as(u1024, max), identity.denominator);
    const data = [_]u8{ 0, 0, 255, 255 };
    const sampled = (try rational(try api.selectWide(128, .{ .curve_type = .{ .samples = .{ .data = &data } } }, target))).rational;
    try t.expect(sampled.numerator > max and sampled.denominator > max);
    try t.expectEqual(@as(u2048, max - 1) * sampled.denominator, @as(u2048, sampled.numerator) * max);
}

test "wide TRC gamma and parametric dispatch preserve exact square root" {
    const curves = [_]@import("trc_tag.zig").Curve{
        .{ .curve_type = .{ .gamma = 512 } },
        .{ .parametric = .{ .function = .type0, .values = .{ 131072, 0, 0, 0, 0, 0, 0 } } },
    };
    for (curves) |curve| {
        const result = try api.selectWide(512, curve, .{ .numerator = 1, .denominator = 4 });
        try t.expect(result == .selected);
        try t.expect(result.selected == .power_root);
        const root = result.selected.power_root;
        const order = try @import("normalized_power_root_compare.zig").Wide.at(512, root.root, root.a, root.b, .{ .numerator = 1, .denominator = 2 });
        try t.expect(order != null);
        try t.expectEqual(.eq, order.?);
    }
}

test "wide TRC retains ambiguity and validates before dispatch" {
    const curve = @import("parametric_curve.zig").Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 32768, 65536, 0 } };
    const scale = @as(u512, 1) << 500;
    const result = try api.selectWide(512, .{ .parametric = curve }, .{ .numerator = scale, .denominator = 2 * scale });
    try t.expect(result == .ambiguous);
    try t.expectError(error.InvalidIccCurveCoordinate, api.selectWide(128, .{ .curve_type = .{ .gamma = 0 } }, .{ .numerator = 0, .denominator = 0 }));
    try t.expectError(error.NonInvertibleIccGamma, api.selectWide(128, .{ .curve_type = .{ .gamma = 0 } }, .{ .numerator = 0, .denominator = 1 }));
    const invalid = [_]u8{ 0, 0, 255, 255, 0, 0 };
    try t.expectError(error.NonMonotonicIccCurve, api.selectWide(128, .{ .curve_type = .{ .samples = .{ .data = &invalid } } }, .{ .numerator = 0, .denominator = 1 }));
}

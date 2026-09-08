const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const api = @import("parametric_attained_inverse.zig");
fn exact(coordinate: api.Coordinate, n: u64, d: u64) !void {
    switch (coordinate) {
        .rational => |r| try std.testing.expectEqual(.eq, try r.order(.{ .numerator = n, .denominator = d })),
        .power_root => |r| try std.testing.expectEqual(.eq, (try @import("normalized_power_root_compare.zig").at(512, r.root, r.a, r.b, .{ .numerator = n, .denominator = d })).?),
    }
}
test "attained inverse chooses the correct side of increasing and decreasing flats" {
    for ([_]i32{ -131072, 131072 }) |a| {
        const curve = Curve{ .function = .type3, .values = .{ 65536, a, if (a > 0) -32768 else 98304, 0, 0, 0, 0 } };
        try exact((try api.select(512, curve, if (a > 0) 0 else 1, 1)).selected, 1, 4);
        try exact((try api.select(512, curve, if (a > 0) 1 else 0, 1)).selected, 3, 4);
        try exact((try api.select(512, curve, 1, 2)).selected, 1, 2);
    }
}
test "attained inverse rejects open extrema and distinguishes gaps from uncertainty" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 32768, 65536, 0 } };
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, api.select(128, curve, 0, 1));
    try exact((try api.select(128, curve, 1, 1)).selected, 1, 2);
    try std.testing.expect((try api.select(128, curve, 1, 2)) == .missing_preimage);
    curve.values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 };
    try std.testing.expect((try api.select(128, curve, 3, 5)) == .missing_preimage);
    curve = .{ .function = .type3, .values = .{ 131072, 65537, 0, 0, 1, 0, 0 } };
    const n = @as(u128, 65537) * 65537 << 64;
    try std.testing.expect((try api.select(128, curve, n, std.math.maxInt(u128))) == .undecided);
    try std.testing.expect((try api.select(512, curve, n, std.math.maxInt(u128))) == .selected);
}
test "attained inverse validates whole curve before selecting a known point" {
    const folded = Curve{ .function = .type3, .values = .{ 131072, 131072, -65536, 0, 0, 0, 0 } };
    try std.testing.expectError(error.NonMonotonicIccCurve, api.select(512, folded, 0, 1));
    const constant = Curve{ .function = .type3, .values = .{ 0, 0, 65536, 0, 0, 0, 0 } };
    try std.testing.expectError(error.ConstantIccCurve, api.select(512, constant, 1, 1));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, api.select(512, constant, 1, 0));
    const undefined_curve = Curve{ .function = .type0, .values = .{ 0, 0, 0, 0, 0, 0, 0 } };
    try std.testing.expectError(error.UndefinedIccCurvePower, api.select(512, undefined_curve, 1, 1));
}
test "attained inverse preserves symbolic roots and terminal singletons" {
    const quadratic = Curve{ .function = .type0, .values = .{ 131072, 0, 0, 0, 0, 0, 0 } };
    const third = (try api.select(512, quadratic, 1, 3)).selected.power_root.root.nonzero;
    try std.testing.expectEqual(third.denominator, 3 * third.numerator);
    try std.testing.expect(!third.negative);
    try std.testing.expectEqual(@as(u32, 131072), third.exponent_denominator);
    const terminal = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 65536, 65536, 0 } };
    try exact((try api.select(512, terminal, 1, 1)).selected, 1, 1);
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, api.select(512, terminal, 0, 1));
}

const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const solve = @import("parametric_preimage.zig").solveWide;
test "extended whole preimages preserve a jump gap and the lower open endpoint" {
    const curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 32768, 65536, 0 } };
    const zero = (try solve(128, curve, 0, 1)).set;
    try std.testing.expect(!zero.isEmpty());
    const lower = zero.linear.?;
    try std.testing.expectEqual(@as(u1024, 0), lower.start.numerator);
    try std.testing.expectEqual(@as(u1024, 32768), lower.end.numerator);
    try std.testing.expectEqual(@as(u1024, 65536), lower.end.denominator);
    try std.testing.expect(!lower.end_included);
    try std.testing.expectEqual(@as(usize, 0), zero.power.?.interval_count + zero.power.?.point_count);
    const one = (try solve(128, curve, 1, 1)).set;
    try std.testing.expect(one.linear == null);
    try std.testing.expectEqual(@as(usize, 1), one.power.?.interval_count);
    try std.testing.expect((try solve(128, curve, 1, 2)).set.isEmpty());
}
test "extended whole preimages preserve the terminal singleton and inactive power branch" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 65536, 0, 0 } };
    const zero = (try solve(128, curve, 0, 1)).set;
    try std.testing.expect(!zero.linear.?.end_included);
    const terminal = zero.power.?.intervals[0];
    try std.testing.expectEqual(.eq, try terminal.start.rational.order(terminal.end.rational));
    try std.testing.expect(terminal.start_included and terminal.end_included);
    try std.testing.expectEqual(@as(u64, 65536), terminal.start.rational.numerator);
    curve.values = .{ 65536, 65536, 0, 65536, 65537, 0, 0 };
    const middle = (try solve(128, curve, 1, 2)).set;
    try std.testing.expect(middle.power == null);
    try std.testing.expectEqual(.eq, try middle.linear.?.start.order(middle.linear.?.end));
    try std.testing.expect(!middle.isEmpty());
}
test "extended whole preimages retain three disconnected roots without imposing invertibility" {
    const curve = Curve{ .function = .type4, .values = .{ 131072, 262144, -196608, 65536, 32768, 0, 0 } };
    const result = (try solve(1024, curve, @as(u512, 1) << 509, @as(u512, 1) << 511)).set;
    try std.testing.expectEqual(.eq, try result.linear.?.start.order(result.linear.?.end));
    try std.testing.expectEqual(result.linear.?.start.denominator, 4 * result.linear.?.start.numerator);
    try std.testing.expectEqual(@as(usize, 2), result.power.?.point_count);
    try std.testing.expectEqual(@as(usize, 0), result.power.?.interval_count);
}
test "extended whole preimages hide an exact lower solution if the upper result is undecided" {
    const curve = Curve{ .function = .type3, .values = .{ 131072, 65537, 0, 65536, 1, 0, 0 } };
    const n = @as(u512, 65537) * 65537 << 448;
    const d = std.math.maxInt(u512);
    try std.testing.expect((try solve(128, curve, n, d)) == .undecided);
    const resolved = (try solve(1024, curve, n, d)).set;
    try std.testing.expect(resolved.linear != null);
    try std.testing.expectEqual(@as(usize, 1), resolved.power.?.point_count);
    try std.testing.expectEqual(.interior, resolved.power.?.points[0].location);
}
test "extended whole preimages validate the entire domain before exposing lower solutions" {
    const invalid = Curve{ .function = .type4, .values = .{ 0, 0, 0, 0, 32768, 0, 0 } };
    try std.testing.expectError(error.UndefinedIccCurvePower, solve(128, invalid, 0, 1));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, solve(128, invalid, 1, 0));
}

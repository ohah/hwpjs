const std = @import("std");
const jump = @import("parametric_jump.zig");
const Curve = @import("parametric_curve.zig").Curve;
fn check(values: [7]i32, expected: std.math.Order) !void {
    const result = try jump.inspect(256, .{ .function = .type4, .values = values });
    try std.testing.expectEqual(expected, result.boundary.order.?);
}
test "parametric jump distinguishes exact continuity and opposite jump directions" {
    try check(.{ 65536, 65536, 0, 131072, 32768, 0, 0 }, .lt);
    try check(.{ 65536, 0, 0, 0, 32768, 65536, 0 }, .gt);
    try check(.{ 65536, 1, 0, 1, 1, 0, 0 }, .eq); // Both values are 1/2^32.
    try check(.{ 65536, 2, 0, 1, 1, 0, 0 }, .gt);
    try check(.{ 65536, 0, 0, 1, 1, 0, 0 }, .lt);
    try check(.{ 65536, 65536, 0, 65536, 32768, 32768, 32768 }, .eq);
}
test "parametric jump clips both limits without erasing interior differences" {
    try check(.{ 65536, 0, -65536, 0, 32768, 0, -131072 }, .eq);
    try check(.{ 65536, 0, 131072, 0, 32768, 0, 196608 }, .eq);
    try check(.{ 65536, 0, 65536, 0, 32768, 0, -65536 }, .gt);
    try check(.{ 65536, 0, 0, 0, 32768, 0, 131072 }, .lt);
    try check(.{ 65536, 0, 32768, 0, 32768, 0, 0 }, .gt);
    try check(.{ 65536, 0, 32768, 0, 32768, 0, 65536 }, .lt);
}
test "parametric jump retains terminal boundary and validates absent branches" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 65536, 65536, 0 } };
    const boundary = (try jump.inspect(256, curve)).boundary;
    try std.testing.expectEqual(.gt, boundary.order.?);
    try std.testing.expectEqual(boundary.at.denominator, boundary.at.numerator);
    curve.values[4] = 65537;
    try std.testing.expect((try jump.inspect(256, curve)) == .none);
    curve.values[4] = 0;
    try std.testing.expect((try jump.inspect(256, curve)) == .none);
    curve.values[0] = 0;
    try std.testing.expectError(error.UndefinedIccCurvePower, jump.inspect(256, curve));
    curve.function = .type1;
    try std.testing.expectError(error.UndefinedIccCurveThreshold, jump.inspect(256, curve));
}

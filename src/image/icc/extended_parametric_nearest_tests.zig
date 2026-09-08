const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const select = @import("parametric_nearest.zig").selectWide;
test "extended interval projection distinguishes target hits and excluded endpoints" {
    const project = @import("rational_interval_nearest.zig").project;
    const interval = @import("unit_interval.zig").WideInterval{ .start = .{ .numerator = 1, .denominator = 4 }, .end = .{ .numerator = 3, .denominator = 4 }, .start_included = false, .end_included = false };
    const d: u512 = @as(u512, 1) << 511;
    const left = try project(512, .{ .numerator = d / 4, .denominator = d }, interval);
    try std.testing.expect(left == .endpoint);
    try std.testing.expect(!left.endpoint.attained);
    try std.testing.expectEqual(.eq, try left.endpoint.value.order(interval.start));
    const right = try project(512, .{ .numerator = d / 4 * 3, .denominator = d }, interval);
    try std.testing.expect(right == .endpoint);
    try std.testing.expect(!right.endpoint.attained);
    try std.testing.expectEqual(.eq, try right.endpoint.value.order(interval.end));
    try std.testing.expect((try project(512, .{ .numerator = d / 4 + 1, .denominator = d }, interval)) == .target);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, project(512, .{ .numerator = 0, .denominator = 0 }, interval));
}
test "extended whole nearest preserves targets and distinguishes full width gap neighbors" {
    const max = std.math.maxInt(u512);
    var curve = Curve{ .function = .type4, .values = .{ 65536, 65536, 0, -65536, 65537, 0, 65536 } };
    const exact = (try select(1024, curve, .{ .numerator = max - 1, .denominator = max })).selected.rational;
    try std.testing.expectEqual(max - 1, exact.numerator);
    try std.testing.expectEqual(max, exact.denominator);
    curve.values = .{ 65536, 0, 0, 0, 32768, 65536, 0 };
    try std.testing.expectEqual(@as(u512, 0), (try select(1024, curve, .{ .numerator = max / 2, .denominator = max })).selected.rational.numerator);
    try std.testing.expectEqual(@as(u256, 1), (try select(1024, curve, .{ .numerator = max / 2 + 1, .denominator = max })).selected.power_endpoint.value.rational.numerator);
    try std.testing.expect((try select(1024, curve, .{ .numerator = @as(u512, 1) << 510, .denominator = @as(u512, 1) << 511 })) == .tie);
    curve.values[3] = 65536;
    try std.testing.expect((try select(1024, curve, .{ .numerator = max / 4 * 3, .denominator = max })) == .unattained);
}
test "extended whole nearest preserves unattained infimum and attained ties" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } };
    try std.testing.expect((try select(512, curve, .{ .numerator = 3, .denominator = 5 })) == .unattained);
    const tied_open = (try select(512, curve, .{ .numerator = 3, .denominator = 4 })).selected.power_endpoint;
    try std.testing.expectEqual(@as(u512, 1), tied_open.value.rational.numerator);
    curve.values[3] = 0;
    const tie = (try select(512, curve, .{ .numerator = 1, .denominator = 2 })).tie;
    try std.testing.expectEqual(@as(u512, 0), tie.linear.numerator);
    try std.testing.expectEqual(@as(u512, 1), tie.power_endpoint.value.rational.numerator);
}
test "extended whole nearest deduplicates common output and supports inactive power" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 16384, 0, 32768, 0, 16384 } };
    const result = try select(512, curve, .{ .numerator = 1, .denominator = 2 });
    try std.testing.expect(result == .selected);
    try std.testing.expect(result.selected == .rational);
    const same = result.selected.rational;
    try std.testing.expectEqual(.eq, try same.order(.{ .numerator = 1, .denominator = 4 }));
    curve.values = .{ 65536, 65536, 0, -65536, 65537, 0, 65536 };
    const inactive = (try select(512, curve, .{ .numerator = 1, .denominator = 3 })).selected.rational;
    try std.testing.expectEqual(@as(u512, 1), inactive.numerator);
    try std.testing.expectEqual(@as(u512, 3), inactive.denominator);
}
test "extended whole nearest exact lower hit avoids irrelevant upper uncertainty after domain validation" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 65536, 49152, 0, 0 } };
    const target = @import("parametric_nearest.zig").WideTarget{ .numerator = @as(u512, 11749380235262596085) << 448, .denominator = @as(u512, 16616132878186749607) << 448 };
    try std.testing.expect((try @import("power_range_nearest.zig").selectWide(128, curve, target)) == .undecided);
    const exact = (try select(128, curve, target)).selected.rational;
    try std.testing.expectEqual(@as(u512, target.numerator), exact.numerator);
    try std.testing.expectEqual(@as(u512, target.denominator), exact.denominator);
    curve.values[2] = -32768;
    try std.testing.expectError(error.UndefinedIccCurvePower, select(128, curve, target));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(128, curve, .{ .numerator = 0, .denominator = 0 }));
}
test "extended whole nearest retains genuine unknown and resolves at higher precision" {
    const curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 0, 32768, 0, 0 } };
    const target = @import("parametric_nearest.zig").WideTarget{ .numerator = @as(u512, 11749380235262596085) << 448, .denominator = @as(u512, 16616132878186749607) << 448 };
    try std.testing.expect((try select(128, curve, target)) == .undecided);
    const resolved = (try select(512, curve, target)).selected.power_endpoint;
    try std.testing.expectEqual(@as(i32, 32768), resolved.value.power.g);
    try std.testing.expectEqual(2 * resolved.value.power.base.numerator, @as(i128, @intCast(resolved.value.power.base.denominator)));
}

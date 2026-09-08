const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const select = @import("parametric_nearest.zig").select;
test "whole nearest preserves unattained infimum and attained ties" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } };
    try std.testing.expect((try select(512, curve, .{ .numerator = 3, .denominator = 5 })) == .unattained);
    const tied_open = (try select(512, curve, .{ .numerator = 3, .denominator = 4 })).selected.power_endpoint;
    try std.testing.expectEqual(@as(u256, 1), tied_open.value.rational.numerator);
    curve.values[3] = 0;
    const tie = (try select(512, curve, .{ .numerator = 1, .denominator = 2 })).tie;
    try std.testing.expectEqual(@as(u256, 0), tie.linear.numerator);
    try std.testing.expectEqual(@as(u256, 1), tie.power_endpoint.value.rational.numerator);
}
test "whole nearest deduplicates common output and supports inactive power" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 16384, 0, 32768, 0, 16384 } };
    const same = (try select(512, curve, .{ .numerator = 1, .denominator = 2 })).selected.rational;
    try std.testing.expectEqual(.eq, try same.order(.{ .numerator = 1, .denominator = 4 }));
    curve.values = .{ 65536, 65536, 0, -65536, 65537, 0, 65536 };
    const inactive = (try select(512, curve, .{ .numerator = 1, .denominator = 3 })).selected.rational;
    try std.testing.expectEqual(@as(u256, 1), inactive.numerator);
    try std.testing.expectEqual(@as(u256, 3), inactive.denominator);
}
test "whole nearest exact lower hit avoids irrelevant upper uncertainty after domain validation" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 65536, 49152, 0, 0 } };
    const target = @import("parametric_nearest.zig").Target{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 };
    try std.testing.expect((try @import("power_range_nearest.zig").select(128, curve, target)) == .undecided);
    const exact = (try select(128, curve, target)).selected.rational;
    try std.testing.expectEqual(@as(u256, target.numerator), exact.numerator);
    try std.testing.expectEqual(@as(u256, target.denominator), exact.denominator);
    curve.values[2] = -32768;
    try std.testing.expectError(error.UndefinedIccCurvePower, select(128, curve, target));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(128, curve, .{ .numerator = 0, .denominator = 0 }));
}
test "whole nearest retains genuine unknown and resolves at higher precision" {
    const curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 0, 32768, 0, 0 } };
    const target = @import("parametric_nearest.zig").Target{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 };
    try std.testing.expect((try select(128, curve, target)) == .undecided);
    const resolved = (try select(512, curve, target)).selected.power_endpoint;
    try std.testing.expectEqual(@as(i32, 32768), resolved.value.power.g);
    try std.testing.expectEqual(2 * resolved.value.power.base.numerator, @as(i128, @intCast(resolved.value.power.base.denominator)));
}

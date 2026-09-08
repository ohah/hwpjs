const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const build = @import("parametric_range.zig").build;
test "whole output range retains a jump gap and an open lower image" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } };
    const result = (try build(512, curve)).set;
    try std.testing.expectEqual(.eq, try result.linear.?.end.order(.{ .numerator = 1, .denominator = 2 }));
    try std.testing.expect(!result.linear.?.end_included);
    try std.testing.expectEqual(@as(u256, 1), result.power.?.lower.value.rational.numerator);
    try std.testing.expectEqual(@as(u256, 1), result.power.?.upper.value.rational.numerator);
    curve.values[3] = 0;
    const step = (try build(512, curve)).set;
    try std.testing.expectEqual(.eq, try step.linear.?.start.order(step.linear.?.end));
    try std.testing.expect(step.linear.?.start_included and step.linear.?.end_included);
    try std.testing.expectEqual(@as(u256, 0), step.linear.?.start.numerator);
    try std.testing.expectEqual(@as(u256, 1), step.power.?.lower.value.rational.numerator);
}
test "whole output range preserves overlapping images and a terminal point" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 65536, 0, 131072, 32768, 0, 0 } };
    const overlapping = (try build(512, curve)).set;
    try std.testing.expectEqual(.eq, try overlapping.linear.?.end.order(.{ .numerator = 1, .denominator = 1 }));
    try std.testing.expect(!overlapping.linear.?.end_included);
    const low = overlapping.power.?.lower.value.power;
    try std.testing.expectEqual(@as(i128, @intCast(low.base.denominator)), 2 * low.base.numerator);
    try std.testing.expectEqual(@as(i32, 65536), low.g);
    try std.testing.expectEqual(@as(u256, 1), overlapping.power.?.upper.value.rational.numerator);
    curve.values = .{ 65536, 65536, 0, 0, 65536, 0, 0 };
    const terminal = (try build(512, curve)).set;
    try std.testing.expectEqual(@as(u256, 0), terminal.linear.?.start.numerator);
    try std.testing.expectEqual(.eq, try terminal.power.?.source.interval.start.order(terminal.power.?.source.interval.end));
    try std.testing.expectEqual(@as(u256, 1), terminal.power.?.lower.value.rational.numerator);
}
test "whole output range distinguishes absent branches and validates whole curve" {
    var curve = Curve{ .function = .type3, .values = .{ 65536, 65536, 0, 32768, 65537, 0, 0 } };
    const lower = (try build(512, curve)).set;
    try std.testing.expect(lower.power == null);
    try std.testing.expect(lower.linear.?.end_included);
    try std.testing.expectEqual(.eq, try lower.linear.?.end.order(.{ .numerator = 1, .denominator = 2 }));
    curve = .{ .function = .type0, .values = .{ 131072, 0, 0, 0, 0, 0, 0 } };
    try std.testing.expect((try build(512, curve)).set.linear == null);
    curve = .{ .function = .type4, .values = .{ 0, 0, 0, 0, 32768, 0, 0 } };
    try std.testing.expectError(error.UndefinedIccCurvePower, build(512, curve));
}

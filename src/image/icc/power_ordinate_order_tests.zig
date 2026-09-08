const std = @import("std");
const wide = @import("rational_power_order.zig").Of(256).compare;
const compare = @import("power_ordinate_order.zig").compare;
const Value = @import("power_ordinate.zig").Value;
test "wide power comparison preserves full signed magnitude and exact equality" {
    try std.testing.expectEqual(.eq, (try wide(128, std.math.minInt(i256), @as(u256, 1) << 255, 65536, -1, 1)).?);
    const a: u256 = (@as(u256, 1) << 126) + 1;
    const b: u256 = (@as(u256, 1) << 127) - 1;
    try std.testing.expectEqual(.eq, (try wide(128, @intCast(a * a), b * b, 32768, @intCast(a), b)).?);
    try std.testing.expectEqual(.eq, (try wide(128, @intCast(a * a), b * b, -32768, @intCast(b), a)).?);
    try std.testing.expectError(error.InvalidIccPowerCoordinate, wide(128, 1, 1, 0, 1, 0));
    try std.testing.expectError(error.UndefinedIccCurvePower, wide(128, -1, 1, 32768, 1, 1));
}
test "ordinate comparison retains offset beyond signed128 and rational256" {
    const max = std.math.maxInt(u128);
    var value = Value{ .power = .{ .base = .{ .numerator = 1, .denominator = 1 }, .g = 0, .offset = -32768 } };
    try std.testing.expectEqual(.eq, (try compare(128, value, .{ .numerator = max / 3, .denominator = (max / 3) * 2 })).?);
    value.power.offset = std.math.minInt(i32);
    try std.testing.expectEqual(.lt, (try compare(128, value, .{ .numerator = max - 1, .denominator = max })).?);
    value.power.offset = std.math.maxInt(i32);
    try std.testing.expectEqual(.gt, (try compare(128, value, .{ .numerator = max - 1, .denominator = max })).?);
    value = .{ .rational = .{ .numerator = (@as(u256, 1) << 255) - 1, .denominator = std.math.maxInt(u256) } };
    try std.testing.expectEqual(.lt, (try compare(128, value, .{ .numerator = 1, .denominator = 2 })).?);
}
test "ordinate comparison keeps precision uncertainty and validates inputs" {
    var value = Value{ .power = .{ .base = .{ .numerator = 1, .denominator = 2 }, .g = 32768, .offset = 0 } };
    const target = @import("power_ordinate_order.zig").Target{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 };
    try std.testing.expect(try compare(128, value, target) == null);
    try std.testing.expectEqual(.lt, (try compare(512, value, target)).?);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, compare(128, value, .{ .numerator = 0, .denominator = 0 }));
    value.power.base.numerator = -1;
    try std.testing.expectError(error.UndefinedIccCurvePower, compare(128, value, .{ .numerator = 0, .denominator = 1 }));
    value = .{ .rational = .{ .numerator = 2, .denominator = 1 } };
    try std.testing.expectError(error.InvalidIccCurveCoordinate, compare(128, value, target));
}
test "factory power output order agrees with exact square plus offset" {
    const source = @import("parametric_segments.zig").Power{ .interval = .{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } }, .a = 65536, .b = 0, .g = 131072, .offset = 16384 };
    const value = (try @import("power_ordinate.zig").at(512, source, .{ .numerator = 1, .denominator = 2 })).?;
    try std.testing.expect(value == .power);
    try std.testing.expectEqual(.eq, (try compare(128, value, .{ .numerator = 1, .denominator = 2 })).?);
    try std.testing.expectEqual(.gt, (try compare(128, value, .{ .numerator = 1, .denominator = 3 })).?);
    try std.testing.expectEqual(.lt, (try compare(128, value, .{ .numerator = 2, .denominator = 3 })).?);
}

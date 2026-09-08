const std = @import("std");
const compare = @import("power_ordinate_distance.zig").compare;
const Value = @import("power_ordinate.zig").Value;
test "distance band retains reflection outside unit range and full width" {
    const band = @import("ordinate_distance_band.zig");
    const low = try band.build(.{ .numerator = 0, .denominator = 1 }, .{ .numerator = 1, .denominator = 1 });
    try std.testing.expectEqual(@as(i386, -1), low.lower);
    try std.testing.expectEqual(@as(i386, 1), low.upper);
    const max = try band.build(.{ .numerator = std.math.maxInt(u128), .denominator = std.math.maxInt(u128) }, .{ .numerator = 0, .denominator = std.math.maxInt(u256) });
    try std.testing.expectEqual(@as(u384, std.math.maxInt(u128)) * std.math.maxInt(u256), max.denominator);
    try std.testing.expectEqual(@as(i386, 0), max.lower);
    try std.testing.expectEqual(2 * @as(i386, max.denominator), max.upper);
}
test "512 bit rational power order preserves roots extremes and shifted ratios" {
    const wide = @import("rational_power_order.zig").Of(512).compare;
    const a: u512 = (@as(u512, 1) << 254) + 1;
    const b: u512 = (@as(u512, 1) << 255) - 1;
    try std.testing.expectEqual(.eq, (try wide(128, @intCast(a * a), b * b, 32768, @intCast(a), b)).?);
    try std.testing.expectEqual(.eq, (try wide(128, std.math.minInt(i512), @as(u512, 1) << 511, 65536, -1, 1)).?);
    try std.testing.expectEqual(.gt, (try wide(128, @as(i512, 1) << 500, 1, 65536, 1, 1)).?);
    try std.testing.expectEqual(.lt, (try wide(128, 1, @as(u512, 1) << 500, 65536, 1, 1)).?);
    try std.testing.expectError(error.UndefinedIccCurvePower, wide(128, -1, 1, 32768, 1, 1));
}
test "power ordinate distances preserve ties and both directions" {
    const value = Value{ .power = .{ .base = .{ .numerator = 1, .denominator = 2 }, .g = 131072, .offset = 0 } };
    const r = @import("fraction.zig").WideFraction{ .numerator = 3, .denominator = 4 };
    try std.testing.expectEqual(.eq, (try compare(512, value, r, .{ .numerator = 1, .denominator = 2 })).?);
    try std.testing.expectEqual(.lt, (try compare(512, value, r, .{ .numerator = 2, .denominator = 5 })).?);
    try std.testing.expectEqual(.gt, (try compare(512, value, r, .{ .numerator = 3, .denominator = 5 })).?);
    const rational = Value{ .rational = .{ .numerator = 1, .denominator = 4 } };
    try std.testing.expectEqual(.eq, (try compare(128, rational, r, .{ .numerator = 1, .denominator = 2 })).?);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, compare(512, value, .{ .numerator = 0, .denominator = 0 }, .{ .numerator = 0, .denominator = 1 }));
}
test "distance comparison retains unknown reflected boundary and large offsets" {
    var value = Value{ .power = .{ .base = .{ .numerator = 1, .denominator = 2 }, .g = 32768, .offset = 0 } };
    const r = @import("fraction.zig").WideFraction{ .numerator = 0, .denominator = 1 };
    const target = @import("power_ordinate_distance.zig").Target{ .numerator = 11749380235262596085, .denominator = 2 * @as(u128, 16616132878186749607) };
    try std.testing.expect(try compare(128, value, r, target) == null);
    try std.testing.expectEqual(.lt, (try compare(512, value, r, target)).?);
    value.power.offset = std.math.minInt(i32);
    try std.testing.expectEqual(.gt, (try compare(128, value, .{ .numerator = 0, .denominator = std.math.maxInt(u256) }, .{ .numerator = std.math.maxInt(u128), .denominator = std.math.maxInt(u128) })).?);
    value.power.offset = std.math.maxInt(i32);
    try std.testing.expectEqual(.gt, (try compare(128, value, .{ .numerator = 1, .denominator = std.math.maxInt(u256) }, .{ .numerator = 0, .denominator = std.math.maxInt(u128) })).?);
}

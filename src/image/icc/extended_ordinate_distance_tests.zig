const std = @import("std");
const compare = @import("power_ordinate_distance.zig").compareWide;
const Value = @import("power_ordinate.zig").Value;
test "extended distance distinguishes full width neighbors across a midpoint" {
    const max = std.math.maxInt(u512);
    const r = @import("fraction.zig").WideFraction{ .numerator = 0, .denominator = 1 };
    for ([_]Value{
        .{ .rational = .{ .numerator = 1, .denominator = 2 } },
        .{ .power = .{ .base = .{ .numerator = 1, .denominator = 2 }, .g = 65536, .offset = 0 } },
    }) |value| {
        try std.testing.expectEqual(.gt, (try compare(1024, value, r, .{ .numerator = max / 4, .denominator = max })).?);
        try std.testing.expectEqual(.lt, (try compare(1024, value, r, .{ .numerator = max / 4 + 1, .denominator = max })).?);
    }
}
test "extended distance band retains reflection outside unit range and full width" {
    const band = @import("ordinate_distance_band.zig");
    const low = try band.buildWide(.{ .numerator = 0, .denominator = 1 }, .{ .numerator = 1, .denominator = 1 });
    try std.testing.expectEqual(@as(i770, -1), low.lower);
    try std.testing.expectEqual(@as(i770, 1), low.upper);
    const max = try band.buildWide(.{ .numerator = std.math.maxInt(u512), .denominator = std.math.maxInt(u512) }, .{ .numerator = 0, .denominator = std.math.maxInt(u256) });
    try std.testing.expectEqual(@as(u768, std.math.maxInt(u512)) * std.math.maxInt(u256), max.denominator);
    try std.testing.expectEqual(@as(i770, 0), max.lower);
    try std.testing.expectEqual(2 * @as(i770, max.denominator), max.upper);
}
test "extended power ordinate distances preserve ties and both directions" {
    const value = Value{ .power = .{ .base = .{ .numerator = 1, .denominator = 2 }, .g = 131072, .offset = 0 } };
    const r = @import("fraction.zig").WideFraction{ .numerator = 3, .denominator = 4 };
    try std.testing.expectEqual(.eq, (try compare(512, value, r, .{ .numerator = 1, .denominator = 2 })).?);
    try std.testing.expectEqual(.lt, (try compare(512, value, r, .{ .numerator = 2, .denominator = 5 })).?);
    try std.testing.expectEqual(.gt, (try compare(512, value, r, .{ .numerator = 3, .denominator = 5 })).?);
    const rational = Value{ .rational = .{ .numerator = 1, .denominator = 4 } };
    try std.testing.expectEqual(.eq, (try compare(128, rational, r, .{ .numerator = 1, .denominator = 2 })).?);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, compare(512, value, .{ .numerator = 0, .denominator = 0 }, .{ .numerator = 0, .denominator = 1 }));
}
test "extended distance comparison retains unknown reflected boundary and large offsets" {
    var value = Value{ .power = .{ .base = .{ .numerator = 1, .denominator = 2 }, .g = 32768, .offset = 0 } };
    const r = @import("fraction.zig").WideFraction{ .numerator = 0, .denominator = 1 };
    const target = @import("power_ordinate_distance.zig").WideTarget{ .numerator = 11749380235262596085, .denominator = 2 * @as(u512, 16616132878186749607) };
    try std.testing.expect(try compare(128, value, r, target) == null);
    try std.testing.expectEqual(.lt, (try compare(512, value, r, target)).?);
    value.power.offset = std.math.minInt(i32);
    try std.testing.expectEqual(.gt, (try compare(128, value, .{ .numerator = 0, .denominator = std.math.maxInt(u256) }, .{ .numerator = std.math.maxInt(u512), .denominator = std.math.maxInt(u512) })).?);
    value.power.offset = std.math.maxInt(i32);
    try std.testing.expectEqual(.gt, (try compare(128, value, .{ .numerator = 1, .denominator = std.math.maxInt(u256) }, .{ .numerator = 0, .denominator = std.math.maxInt(u512) })).?);
}

const std = @import("std");
const order = @import("power_level_order.zig");
const Power = @import("parametric_segments.zig").Power;
const x = @import("fraction.zig").Fraction{ .numerator = 0, .denominator = 1 };
test "unclipped power-level order handles negative base and exponent directions" {
    var p = Power{ .interval = .{ .start = x, .end = .{ .numerator = 1, .denominator = 1 } }, .a = 0, .b = -131072, .g = -65536, .offset = 0 };
    try std.testing.expectEqual(.gt, (try order.at(256, p, x, -65536)).?);
    p.g = 65536;
    try std.testing.expectEqual(.lt, (try order.at(256, p, x, -65536)).?);
    p.g = 131072;
    try std.testing.expectEqual(.gt, (try order.at(256, p, x, 65536)).?);
    p.g = -131072;
    try std.testing.expectEqual(.lt, (try order.at(256, p, x, 65536)).?);
    p.g = 32768;
    try std.testing.expectError(error.UndefinedIccCurvePower, order.at(256, p, x, 0));
    p.b = 0;
    p.g = 0;
    try std.testing.expectError(error.UndefinedIccCurvePower, order.at(256, p, x, 0));
    p.g = 65536;
    try std.testing.expectEqual(.eq, (try order.at(256, p, x, 0)).?);
    p.interval.start_included = false;
    try std.testing.expectError(error.OutsideIccPowerInterval, order.at(256, p, x, 0));
}
test "unclipped level comparison preserves values either side of a clipping boundary" {
    const p = Power{ .interval = .{ .start = x, .end = .{ .numerator = 1, .denominator = 1 } }, .a = 65536, .b = 0, .g = 131072, .offset = 32768 };
    try std.testing.expectEqual(.lt, (try order.at(256, p, .{ .numerator = 4866752642924153522, .denominator = 6882627592338442563 }, 65536)).?);
    try std.testing.expectEqual(.gt, (try order.at(256, p, .{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 }, 65536)).?);
}

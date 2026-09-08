const std = @import("std");
const t = std.testing;
const api = @import("linear_rgb_target.zig");
test "wide linear targets preserve full-width denominators and exact boundaries" {
    const max = std.math.maxInt(u512);
    const n = std.math.maxInt(i512);
    const value = try api.Wide.normalize(n, max);
    try t.expectEqual(.none, value.clipping);
    try t.expectEqual(@as(u512, n), value.target.numerator);
    try t.expectEqual(max, value.target.denominator);
    try t.expectEqual(.lt, try value.target.order(.{ .numerator = 1, .denominator = 2 }));
    const one = try api.Wide.normalize(n, @intCast(n));
    try t.expectEqual(.none, one.clipping);
    try t.expectEqual(@as(u512, n), one.target.denominator);
    const zero = try api.Wide.normalize(0, max);
    try t.expectEqual(.none, zero.clipping);
    try t.expectEqual(max, zero.target.denominator);
}
test "wide linear targets reject zero denominator before clipping and handle signed minimum" {
    try t.expectError(error.InvalidIccMatrixCoordinate, api.Wide.normalize(std.math.minInt(i512), 0));
    const below = try api.Wide.normalize(std.math.minInt(i512), 1);
    try t.expectEqual(.below, below.clipping);
    try t.expectEqualDeep(api.Wide.Target{ .numerator = 0, .denominator = 1 }, below.target);
    const above = try api.Wide.normalize(std.math.maxInt(i512), 1);
    try t.expectEqual(.above, above.clipping);
    try t.expectEqualDeep(api.Wide.Target{ .numerator = 1, .denominator = 1 }, above.target);
}
test "512 bit fractions compare adjacent full-width ratios without overflow" {
    const F = @import("fraction.zig").Normalized(512);
    const max = std.math.maxInt(u512);
    const a = F{ .numerator = max - 1, .denominator = max };
    const b = F{ .numerator = max - 2, .denominator = max - 1 };
    try t.expectEqual(.gt, try a.order(b));
    try t.expectEqual(.eq, try (F{ .numerator = max, .denominator = max }).order(.{ .numerator = 1, .denominator = 1 }));
    try t.expectError(error.InvalidIccCurveCoordinate, a.order(.{ .numerator = 1, .denominator = 0 }));
    try t.expectError(error.InvalidIccCurveCoordinate, (F{ .numerator = 2, .denominator = 1 }).validate());
}
test "wide and existing linear target paths agree exactly on shared input range" {
    for ([_]i128{ std.math.minInt(i128), -1, 0, 1, std.math.maxInt(i128) }) |n| {
        for ([_]u128{ 1, 2, std.math.maxInt(u128) }) |d| {
            const old = try api.normalize(n, d);
            const wide = try api.Wide.normalize(n, d);
            try t.expectEqual(old.clipping, wide.clipping);
            try t.expectEqual(@as(u512, old.target.numerator), wide.target.numerator);
            try t.expectEqual(@as(u512, old.target.denominator), wide.target.denominator);
        }
    }
}

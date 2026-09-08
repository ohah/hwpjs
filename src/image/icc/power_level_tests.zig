const std = @import("std");
const level = @import("power_level.zig");

test "power level preserves irrational and negative reciprocal roots" {
    const square = level.solve(131072, -65536, 65536).finite;
    try std.testing.expectEqual(@as(usize, 2), square.count);
    const positive = square.roots[0].nonzero;
    try std.testing.expect(!positive.negative);
    try std.testing.expect(square.roots[1].nonzero.negative);
    try std.testing.expectEqual(@as(u64, 131072), positive.numerator);
    try std.testing.expectEqual(@as(i32, 65536), positive.exponent_numerator);
    try std.testing.expectEqual(@as(u32, 131072), positive.exponent_denominator);
    const reciprocal = level.solve(-196608, 65536, 0).finite;
    try std.testing.expectEqual(@as(usize, 1), reciprocal.count);
    try std.testing.expect(reciprocal.roots[0].nonzero.negative);
    try std.testing.expectEqual(@as(i32, -65536), reciprocal.roots[0].nonzero.exponent_numerator);
    try std.testing.expectEqual(@as(usize, 0), level.solve(32768, 65536, 0).finite.count);
}

test "power level distinguishes zero base and constant nonzero domain" {
    try std.testing.expect(level.solve(0, 0, 65536) == .all_nonzero);
    try std.testing.expectEqual(@as(usize, 0), level.solve(0, 0, 0).finite.count);
    for ([_]i32{ -2147483648, -65536, -1 }) |g| try std.testing.expectEqual(@as(usize, 0), level.solve(g, 32768, 32768).finite.count);
    for ([_]i32{ 1, 32768, 65536, 2147483647 }) |g| {
        const roots = level.solve(g, 32768, 32768).finite;
        try std.testing.expectEqual(@as(usize, 1), roots.count);
        try std.testing.expect(roots.roots[0] == .zero);
    }
}

test "power level retains full signed fixed16 extremes without exponent expansion" {
    const roots = level.solve(std.math.minInt(i32), std.math.minInt(i32), std.math.maxInt(i32)).finite;
    try std.testing.expectEqual(@as(usize, 2), roots.count);
    for (roots.roots[0..roots.count]) |root| {
        try std.testing.expectEqual(@as(u64, 4294967295), root.nonzero.numerator);
        try std.testing.expectEqual(@as(u32, 2147483648), root.nonzero.exponent_denominator);
        try std.testing.expectEqual(@as(i32, -65536), root.nonzero.exponent_numerator);
    }
    try std.testing.expectEqual(@as(usize, 0), level.solve(std.math.maxInt(i32), std.math.maxInt(i32), std.math.minInt(i32)).finite.count);
}

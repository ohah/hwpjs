const std = @import("std");
const level = @import("normalized_power_level.zig");
test "normalized power levels preserve irrational base roots and real sign branches" {
    const roots = (try level.solve(131072, 0, 1, 3)).finite;
    try std.testing.expectEqual(@as(usize, 2), roots.count);
    for (roots.roots[0..roots.count], 0..) |root, i| {
        const r = root.nonzero;
        try r.validate();
        try std.testing.expectEqual(i == 1, r.negative);
        try std.testing.expectEqual(@as(u512, r.numerator) * 3, @as(u512, r.denominator));
        try std.testing.expectEqual(@as(i32, 65536), r.exponent_numerator);
        try std.testing.expectEqual(@as(u32, 131072), r.exponent_denominator);
    }
    const negative = (try level.solve(-65536, 65536, 0, 1)).finite;
    try std.testing.expectEqual(@as(usize, 1), negative.count);
    try std.testing.expect(negative.roots[0].nonzero.negative);
    try std.testing.expectEqual(@as(i32, -65536), negative.roots[0].nonzero.exponent_numerator);
    try std.testing.expectEqual(@as(usize, 0), (try level.solve(-131072, 65536, 0, 1)).finite.count);
    try std.testing.expectEqual(@as(usize, 0), (try level.solve(32768, 65536, 0, 1)).finite.count);
}
test "normalized power levels distinguish zero and exact exponent-zero equality" {
    const zero = (try level.solve(1, 0, 0, 1)).finite;
    try std.testing.expectEqual(@as(usize, 1), zero.count);
    try std.testing.expect(zero.roots[0] == .zero);
    try std.testing.expectEqual(@as(usize, 0), (try level.solve(-1, 0, 0, 1)).finite.count);
    const d = std.math.maxInt(u128) - 1;
    try std.testing.expect((try level.solve(0, -32768, d / 2, d)) == .all_nonzero);
    for ([_]u128{ d / 2 - 1, d / 2 + 1 }) |n| try std.testing.expectEqual(@as(usize, 0), (try level.solve(0, -32768, n, d)).finite.count);
}
test "normalized power levels need wide radicands and retain extreme exponents" {
    const max = std.math.maxInt(u128);
    const r = (try level.solve(65536, 1, max / 2, max)).finite.roots[0].nonzero;
    try std.testing.expect(r.numerator > max and r.denominator > max);
    try std.testing.expectEqual(@as(u256, 1), std.math.gcd(r.numerator, r.denominator));
    const extreme = (try level.solve(std.math.minInt(i32), std.math.minInt(i32), max - 1, max)).finite;
    try std.testing.expectEqual(@as(usize, 2), extreme.count);
    try std.testing.expectEqual(@as(u32, 2147483648), extreme.roots[0].nonzero.exponent_denominator);
    try std.testing.expectEqual(@as(i32, -65536), extreme.roots[0].nonzero.exponent_numerator);
    try std.testing.expectEqual(@as(usize, 1), (try level.solve(std.math.maxInt(i32), 0, 1, max)).finite.count);
}
test "normalized power root validation rejects invalid coordinates and descriptors" {
    try std.testing.expectError(error.InvalidIccCurveCoordinate, level.solve(0, 0, 1, 0));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, level.solve(65536, 0, 2, 1));
    var r = level.Radical{ .negative = false, .numerator = std.math.maxInt(u256), .denominator = std.math.maxInt(u256), .exponent_numerator = -65536, .exponent_denominator = 2147483648 };
    try r.validate();
    r.numerator = 0;
    try std.testing.expectError(error.InvalidIccPowerRoot, r.validate());
    r.numerator = 1;
    r.denominator = 0;
    try std.testing.expectError(error.InvalidIccPowerRoot, r.validate());
    r.denominator = 1;
    r.exponent_numerator = 1;
    try std.testing.expectError(error.InvalidIccPowerRoot, r.validate());
    r.exponent_numerator = 65536;
    r.exponent_denominator = 0;
    try std.testing.expectError(error.InvalidIccPowerRoot, r.validate());
    r.exponent_denominator = 2147483649;
    try std.testing.expectError(error.InvalidIccPowerRoot, r.validate());
}

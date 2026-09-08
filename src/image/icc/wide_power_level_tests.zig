const std = @import("std");
const t = std.testing;
const api = @import("normalized_power_level.zig");
test "wide power levels retain full offset radicands and both signed extremes" {
    const max = std.math.maxInt(u512);
    for ([_]i32{ std.math.minInt(i32), 0, 1, std.math.maxInt(i32) }) |offset| {
        const out = (try api.solveWide(65536, offset, max - 1, max)).finite;
        try t.expectEqual(@as(usize, 1), out.count);
        const r = out.roots[0].nonzero;
        try r.validate();
        const n = @as(i1024, 65536) * (max - 1) - @as(i1024, offset) * max;
        try t.expectEqual(n < 0, r.negative);
        try t.expectEqual(@abs(n), r.numerator);
        try t.expectEqual(@as(u1024, 65536) * max, r.denominator);
        try t.expect(r.denominator > max);
    }
}
test "wide power levels preserve real roots and extreme reciprocal exponents" {
    const max = std.math.maxInt(u512);
    const two = (try api.solveWide(std.math.minInt(i32), std.math.minInt(i32), 1, max)).finite;
    try t.expectEqual(@as(usize, 2), two.count);
    for (two.roots[0..two.count], 0..) |root, i| {
        const r = root.nonzero;
        try t.expectEqual(i == 1, r.negative);
        try t.expectEqual(@as(i32, -65536), r.exponent_numerator);
        try t.expectEqual(@as(u32, 2147483648), r.exponent_denominator);
    }
    const negative = (try api.solveWide(-65536, 65536, 0, max)).finite;
    try t.expectEqual(@as(usize, 1), negative.count);
    try t.expect(negative.roots[0].nonzero.negative);
    try t.expectEqual(@as(usize, 0), (try api.solveWide(32768, 65536, 0, max)).finite.count);
}
test "wide power levels distinguish zero empty and all nonzero roots exactly" {
    const d = std.math.maxInt(u512) - 1;
    try t.expect((try api.solveWide(0, -32768, d / 2, d)) == .all_nonzero);
    for ([_]u512{ d / 2 - 1, d / 2 + 1 }) |n| try t.expectEqual(@as(usize, 0), (try api.solveWide(0, -32768, n, d)).finite.count);
    const zero = (try api.solveWide(1, 0, 0, d)).finite;
    try t.expectEqual(@as(usize, 1), zero.count);
    try t.expect(zero.roots[0] == .zero);
    try t.expectEqual(@as(usize, 0), (try api.solveWide(-1, 0, 0, d)).finite.count);
    try t.expectError(error.InvalidIccCurveCoordinate, api.solveWide(0, 0, 0, 0));
    try t.expectError(error.InvalidIccCurveCoordinate, api.solveWide(65536, 0, 2, 1));
}
test "wide power descriptor shares validation without narrowing" {
    var r = api.Wide.Radical{ .negative = false, .numerator = std.math.maxInt(u1024), .denominator = 1, .exponent_numerator = 65536, .exponent_denominator = 2147483648 };
    try r.validate();
    r.numerator = 0;
    try t.expectError(error.InvalidIccPowerRoot, r.validate());
    r.numerator = 1;
    r.exponent_numerator = 1;
    try t.expectError(error.InvalidIccPowerRoot, r.validate());
}

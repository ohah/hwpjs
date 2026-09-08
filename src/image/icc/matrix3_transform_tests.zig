const std = @import("std");
const t = std.testing;
const transform = @import("matrix3_transform.zig");
const identity = [9]i32{ 65536, 0, 0, 0, 65536, 0, 0, 0, 65536 };
test "fixed matrix forward preserves row order scale sign and unclipped results" {
    const xyz = [3]i32{ -65536, 32768, 131072 };
    const result = transform.forward(identity, xyz);
    for (xyz, result.numerators) |x, n| try t.expectEqual(@as(i128, x) * 65536, n);
    try t.expectEqual(@as(u128, 1) << 32, result.denominator);
    const asymmetric = transform.forward(.{ 1, 2, 3, 4, 5, 6, 7, 8, 9 }, .{ 2, 3, 5 });
    try t.expectEqualDeep([3]i128{ 23, 53, 83 }, asymmetric.numerators);
    const extreme = transform.forward(@splat(std.math.minInt(i32)), @splat(std.math.minInt(i32)));
    try t.expectEqualDeep([3]i128{ @as(i128, 3) << 62, @as(i128, 3) << 62, @as(i128, 3) << 62 }, extreme.numerators);
}
test "fixed matrix inverse preserves exact fractions and rejects only singularity" {
    const xyz = [3]i32{ -65536, 32768, 131072 };
    const result = try transform.inverse(identity, xyz);
    for (xyz, result.numerators) |x, n| try t.expectEqual(@as(i128, x) * (@as(i128, 1) << 32), n);
    try t.expectEqual(@as(u128, 1) << 48, result.denominator);
    const negative = try transform.inverse(.{ -1, 0, 0, 0, 1, 0, 0, 0, 1 }, .{ 2, 3, 5 });
    try t.expectEqualDeep([3]i128{ -2, 3, 5 }, negative.numerators);
    try t.expectEqual(@as(u128, 1), negative.denominator);
    const asymmetric = try transform.inverse(.{ 1, 2, 0, 0, 1, 3, 0, 0, 1 }, .{ 2, 3, 5 });
    try t.expectEqualDeep([3]i128{ 26, -12, 5 }, asymmetric.numerators);
    try t.expectError(error.InvalidIccAdaptationSingular, transform.inverse(@splat(0), xyz));
    const near = try transform.inverse(.{ 2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1 }, .{ 1, 0, 0 });
    try t.expectEqual(@as(u128, 1), near.denominator);
    try t.expectEqualDeep([3]i128{ -2147483645, 2147483646, 0 }, near.numerators);
}

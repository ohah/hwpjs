const std = @import("std");
const t = std.testing;
const api = @import("matrix3_fraction_inverse.zig");
const identity = [9]i32{ 65536, 0, 0, 0, 65536, 0, 0, 0, 65536 };
fn verifyEquation(a: [9]i32, input: api.Input, out: api.ExactVector) !void {
    try t.expect(out.denominator > 0);
    for (0..3) |row| {
        var sum: i1024 = 0;
        for (0..3) |column| sum += @as(i1024, a[row * 3 + column]) * out.numerators[column];
        try t.expectEqual(@as(i1024, input.numerators[row]) * @as(i1024, @intCast(out.denominator)) * 65536, sum * @as(i1024, input.denominator));
    }
}
test "fraction matrix inverse retains full input width and signed extremes" {
    const input = api.Input{ .numerators = .{ std.math.minInt(i256), std.math.maxInt(i256), -1 }, .denominator = std.math.maxInt(u256) };
    const out = try api.inverse(identity, input);
    try verifyEquation(identity, input, out);
    try t.expect(out.denominator > std.math.maxInt(u256));
    try t.expect(out.numerators[0] < std.math.minInt(i256));
}
test "fraction matrix inverse transposes cofactors and preserves determinant sign" {
    const input = api.Input{ .numerators = .{ 5, -7, 11 }, .denominator = 13 };
    for ([_][9]i32{
        .{ 1, 2, 3, 0, -7, 5, 0, 0, 11 },
        .{ 0, 65536, 0, 65536, 0, 0, 0, 0, 65536 },
        .{ 2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1 },
    }) |a| try verifyEquation(a, input, try api.inverse(a, input));
}
test "fraction matrix exact forward inverse roundtrip retains unlike u64 denominators" {
    const Fraction = @import("fraction.zig").Fraction;
    const max = std.math.maxInt(u64);
    const input = [3]Fraction{ .{ .numerator = max - 1, .denominator = max }, .{ .numerator = 1, .denominator = max - 1 }, .{ .numerator = 2, .denominator = max - 2 } };
    const a = [9]i32{ 12345, -45678, 0, 0, 65536, 32768, 0, 0, -98765 };
    const xyz = try @import("matrix3_fraction.zig").forward(a, input);
    const out = try api.inverse(a, xyz);
    try verifyEquation(a, xyz, out);
    for (input, out.numerators) |x, n| try t.expectEqual(@as(i1024, x.numerator) * @as(i1024, @intCast(out.denominator)), @as(i1024, n) * x.denominator);
}
test "fraction matrix inverse validates input before singularity and does not clip" {
    try t.expectError(error.InvalidIccMatrixCoordinate, api.inverse(@splat(0), .{ .numerators = @splat(0), .denominator = 0 }));
    try t.expectError(error.InvalidIccAdaptationSingular, api.inverse(@splat(0), .{ .numerators = @splat(0), .denominator = 1 }));
    const input = api.Input{ .numerators = .{ -1, 2, 0 }, .denominator = 1 };
    const out = try api.inverse(identity, input);
    const d: i512 = @intCast(out.denominator);
    try t.expectEqualDeep([3]i512{ -d, 2 * d, 0 }, out.numerators);
}

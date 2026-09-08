const std = @import("std");
const t = std.testing;
const inv = @import("sampled_inverse.zig");
fn run(values: []const u16, y: u16) !inv.Fraction {
    const data = try t.allocator.alloc(u8, values.len * 2);
    defer t.allocator.free(data);
    for (values, 0..) |value, i| std.mem.writeInt(u16, data[i * 2 ..][0..2], value, .big);
    return inv.invert(.{ .data = data }, y);
}
fn expect(values: []const u16, y: u16, numerator: u64, denominator: u64) !void {
    const result = try run(values, y);
    try t.expectEqual(numerator * result.denominator, result.numerator * denominator);
}
test "sample inverse increasing decreasing interpolation and nearest endpoint" {
    try expect(&.{ 0, 65535 }, 32768, 32768, 65535);
    try expect(&.{ 65535, 0 }, 32768, 32767, 65535);
    try expect(&.{ 100, 200, 400 }, 300, 3, 4);
    try expect(&.{ 400, 200, 100 }, 300, 1, 4);
    try expect(&.{ 100, 200, 400 }, 0, 0, 1);
    try expect(&.{ 100, 200, 400 }, 65535, 1, 1);
}
test "sample inverse flat tie rules depend on x position not y direction" {
    try expect(&.{ 0, 0, 100, 100, 200, 200 }, 0, 1, 5);
    try expect(&.{ 0, 0, 100, 100, 200, 200 }, 100, 3, 5);
    try expect(&.{ 0, 0, 100, 100, 200, 200 }, 200, 4, 5);
    try expect(&.{ 200, 200, 100, 100, 0, 0 }, 200, 1, 5);
    try expect(&.{ 200, 200, 100, 100, 0, 0 }, 100, 3, 5);
    try expect(&.{ 200, 200, 100, 100, 0, 0 }, 0, 4, 5);
    try expect(&.{ 100, 100, 200, 200 }, 0, 1, 3);
    try expect(&.{ 100, 100, 200, 200 }, 65535, 2, 3);
}
test "sample inverse rejects nonmonotonic tails constant and invalid arrays" {
    try t.expectError(error.NonMonotonicIccCurve, run(&.{ 0, 100, 50 }, 0));
    try t.expectError(error.NonMonotonicIccCurve, run(&.{ 100, 0, 50 }, 100));
    try t.expectError(error.ConstantIccCurve, run(&.{ 7, 7, 7 }, 7));
    try t.expectError(error.InvalidIccInverseSamples, run(&.{}, 0));
    try t.expectError(error.InvalidIccInverseSamples, run(&.{7}, 7));
    try t.expectError(error.InvalidIccInverseSamples, inv.invert(.{ .data = &.{ 0, 0, 0, 0, 0 } }, 0));
}

fn normalized(values: []const u16, numerator: u128, denominator: u128) !inv.WideFraction {
    const data = try t.allocator.alloc(u8, values.len * 2);
    defer t.allocator.free(data);
    for (values, 0..) |value, i| std.mem.writeInt(u16, data[i * 2 ..][0..2], value, .big);
    return inv.invertNormalized(.{ .data = data }, numerator, denominator);
}

test "normalized inverse preserves sub-u16 and full u128 coordinates exactly" {
    const d = std.math.maxInt(u128);
    for ([_]u128{ 1, d / 2, d - 1 }) |n| {
        const up = try normalized(&.{ 0, 65535 }, n, d);
        // Divide the known common scale first: cross multiplication exceeds u256.
        try t.expectEqual(@as(u256, n) * 65535, up.numerator);
        try t.expectEqual(@as(u256, d) * 65535, up.denominator);
        const down = try normalized(&.{ 65535, 0 }, n, d);
        try t.expectEqual(@as(u256, d - n) * 65535, down.numerator);
        try t.expectEqual(up.denominator, down.denominator);
    }
    const half = try normalized(&.{ 0, 65535 }, 1, 2);
    try t.expectEqual(half.denominator, half.numerator * 2);
}

test "normalized inverse shares encoded tie rules and rejects invalid tails" {
    const curves = [_][6]u16{
        .{ 0, 0, 100, 100, 200, 200 },
        .{ 200, 200, 100, 100, 0, 0 },
    };
    for (curves) |curve| for (0..65536) |y| {
        const old = try run(&curve, @intCast(y));
        const wide = try normalized(&curve, y, 65535);
        try t.expectEqual(wide.numerator * old.denominator, wide.denominator * old.numerator);
    };
    try t.expectError(error.InvalidIccCurveCoordinate, normalized(&.{ 0, 65535 }, 0, 0));
    try t.expectError(error.InvalidIccCurveCoordinate, normalized(&.{ 0, 65535 }, 2, 1));
    try t.expectError(error.NonMonotonicIccCurve, normalized(&.{ 0, 100, 50 }, 0, 1));
    try t.expectError(error.ConstantIccCurve, normalized(&.{ 7, 7 }, 0, 1));
    try t.expectError(error.InvalidIccInverseSamples, normalized(&.{0}, 0, 1));
}

test "normalized inverse rational segment round trips independently" {
    // Construct an ordinate from a chosen segment and exact local parameter.
    // This forward equation is independent of the inverse search/branch logic.
    const curves = [_][4]u16{ .{ 1, 300, 12000, 65000 }, .{ 65000, 12000, 300, 1 } };
    for (curves) |curve| for (0..3) |i| {
        for (1..257) |k| {
            const y = @as(u128, curve[i]) * (257 - k) + @as(u128, curve[i + 1]) * k;
            const result = try normalized(&curve, y, 257 * 65535);
            try t.expectEqual(result.numerator * (3 * 257), result.denominator * (i * 257 + k));
        }
    };
}

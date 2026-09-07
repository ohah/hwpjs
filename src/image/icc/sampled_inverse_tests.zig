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

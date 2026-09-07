const std = @import("std");
const t = std.testing;
const forward = @import("sampled_forward.zig");
const inverse = @import("sampled_inverse.zig");
test "sample forward reproduces inverse results including plateau selections" {
    const cases = [_][]const u16{ &.{ 0, 65535 }, &.{ 65535, 0 }, &.{ 100, 100, 200, 200 }, &.{ 200, 200, 100, 100 }, &.{ 0, 100, 100, 200 } };
    for (cases) |values| {
        const data = try t.allocator.alloc(u8, values.len * 2);
        defer t.allocator.free(data);
        for (values, 0..) |value, i| std.mem.writeInt(u16, data[i * 2 ..][0..2], value, .big);
        for ([_]u16{ 0, 1, 99, 100, 101, 150, 199, 200, 201, 32768, 65534, 65535 }) |y| {
            const x = try inverse.invert(.{ .data = data }, y);
            const result = try forward.evaluate(.{ .data = data }, x);
            const expected = std.math.clamp(y, @min(values[0], values[values.len - 1]), @max(values[0], values[values.len - 1]));
            try t.expectEqual(@as(u128, expected) * result.denominator, @as(u128, result.numerator) * 65535);
        }
    }
}
test "forward preserves nonmonotonic and constant values and validates fractions" {
    const samples = @import("curve_type.zig").Samples{ .data = &.{ 0, 0, 255, 255, 0, 0 } };
    const result = try forward.evaluate(samples, .{ .numerator = 1, .denominator = 4 });
    try t.expectEqual(@as(u64, 2) * result.numerator, result.denominator);
    const constant = @import("curve_type.zig").Samples{ .data = &.{ 255, 255, 255, 255 } };
    const max_result = try forward.evaluate(constant, .{ .numerator = forward.max_denominator - 1, .denominator = forward.max_denominator });
    try t.expectEqual(max_result.numerator, max_result.denominator);
    try t.expectError(error.InvalidIccCurveCoordinate, forward.evaluate(samples, .{ .numerator = 0, .denominator = 0 }));
    try t.expectError(error.InvalidIccCurveCoordinate, forward.evaluate(samples, .{ .numerator = 2, .denominator = 1 }));
    try t.expectError(error.IccFractionLimitExceeded, forward.evaluate(samples, .{ .numerator = 1, .denominator = forward.max_denominator + 1 }));
    try t.expectError(error.InvalidIccCurveSamples, forward.evaluate(.{ .data = &.{} }, .{ .numerator = 0, .denominator = 1 }));
    try t.expectError(error.InvalidIccCurveSamples, forward.evaluate(.{ .data = &.{ 0, 0, 0, 0, 0 } }, .{ .numerator = 0, .denominator = 1 }));
}

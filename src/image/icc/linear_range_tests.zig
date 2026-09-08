const std = @import("std");
const build = @import("linear_range.zig").build;
const Linear = @import("parametric_segments.zig").Linear;
fn line(a: i32, b: i32, flags: u2) Linear {
    return .{ .slope = a, .offset = b, .interval = .{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 }, .start_included = flags & 1 != 0, .end_included = flags & 2 != 0 } };
}
test "linear range saturation can attain both outputs despite open input endpoints" {
    for ([_]Linear{ line(131072, -32768, 0), line(-131072, 98304, 0) }) |input| {
        const result = try build(input);
        try std.testing.expectEqual(.eq, try result.start.order(.{ .numerator = 0, .denominator = 1 }));
        try std.testing.expectEqual(.eq, try result.end.order(.{ .numerator = 1, .denominator = 1 }));
        try std.testing.expect(result.start_included and result.end_included);
    }
    const equality = try build(line(65536, 0, 0));
    try std.testing.expect(!equality.start_included and !equality.end_included);
}
test "linear range reverses endpoint ownership and closes constant images" {
    const falling = try build(line(-32768, 49152, 1));
    try std.testing.expectEqual(.eq, try falling.start.order(.{ .numerator = 1, .denominator = 4 }));
    try std.testing.expectEqual(.eq, try falling.end.order(.{ .numerator = 3, .denominator = 4 }));
    try std.testing.expect(!falling.start_included and falling.end_included);
    for ([_]i32{ -65536, 0, 32768, 65536, 131072 }) |b| {
        const result = try build(line(0, b, 0));
        try std.testing.expectEqual(.eq, try result.start.order(result.end));
        try std.testing.expect(result.start_included and result.end_included);
    }
}
test "linear range preserves wide output coordinates and validates domain" {
    const max = std.math.maxInt(u64);
    var input = line(32768, 1, 3);
    input.interval.start = .{ .numerator = max - 2, .denominator = max };
    input.interval.end = .{ .numerator = max - 1, .denominator = max };
    const result = try build(input);
    try std.testing.expect(result.start.denominator > std.math.maxInt(u64));
    try std.testing.expectEqual(.eq, try result.start.order(.{ .numerator = @as(u256, 32768) * (max - 2) + max, .denominator = @as(u256, 65536) * max }));
    input.interval.end = input.interval.start;
    try std.testing.expect((try build(input)).start_included);
    input.interval.end_included = false;
    try std.testing.expectError(error.EmptyIccInterval, build(input));
    input.interval.start.denominator = 0;
    try std.testing.expectError(error.InvalidIccCurveCoordinate, build(input));
}
test "linear output range connects to exact nearest ordinate without inventing endpoints" {
    const nearest = @import("rational_range_nearest.zig");
    const range = try build(line(32768, 0, 1));
    try std.testing.expect((try nearest.select(.{ .numerator = 3, .denominator = 5 }, &.{range})) == .unattained);
    const saturated = try build(line(131072, 0, 1));
    const selected = (try nearest.select(.{ .numerator = 1, .denominator = 1 }, &.{saturated})).nearest;
    try std.testing.expectEqual(.eq, try selected.values[0].order(.{ .numerator = 1, .denominator = 1 }));
}

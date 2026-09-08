const std = @import("std");
const solve = @import("linear_preimage.zig").solve;
const Linear = @import("parametric_segments.zig").Linear;
const choose = @import("preimage_choice.zig").select;
fn line(a: i32, b: i32) Linear {
    return .{ .slope = a, .offset = b, .interval = .{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } } };
}
test "linear preimages preserve wide normalized inputs without quantization" {
    const max = std.math.maxInt(u128);
    const result = (try solve(line(65536, 0), max - 1, max)).?;
    try std.testing.expectEqual(.eq, try result.start.order(.{ .numerator = max - 1, .denominator = max }));
    try std.testing.expectEqual(.eq, try result.start.order(result.end));
    try std.testing.expect(result.start.denominator > std.math.maxInt(u64));
    const reverse = (try solve(line(-65536, 65536), max - 1, max)).?;
    try std.testing.expectEqual(.eq, try reverse.start.order(.{ .numerator = 1, .denominator = max }));
    const large = (try solve(line(std.math.maxInt(i32), 0), max / 2, max)).?.start;
    try std.testing.expect(large.denominator > std.math.maxInt(u128));
    try std.testing.expectEqual(@as(u512, large.numerator) * std.math.maxInt(i32) * max, @as(u512, large.denominator) * 65536 * (max / 2));
}
test "linear clipped preimages retain open plateau and terminal cutoff" {
    var lower = line(0, 0);
    lower.interval.end = .{ .numerator = 1, .denominator = 2 };
    lower.interval.end_included = false;
    const plateau = (try solve(lower, 0, 1)).?;
    try std.testing.expect(!plateau.end_included);
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, choose(plateau));
    lower.slope = 131072;
    try std.testing.expect((try solve(lower, 1, 1)) == null);
    const terminal = (try solve(line(131072, 0), 1, 1)).?;
    try std.testing.expectEqual(.eq, try (try choose(terminal)).order(.{ .numerator = 1, .denominator = 2 }));
    const descending = (try solve(line(-131072, 65536), 0, 1)).?;
    try std.testing.expectEqual(.eq, try (try choose(descending)).order(.{ .numerator = 1, .denominator = 2 }));
}
test "linear preimage handles constant and outside roots without inventing nearest values" {
    try std.testing.expect((try solve(line(0, -65536), 0, 1)) != null);
    try std.testing.expect((try solve(line(0, 131072), 1, 1)) != null);
    try std.testing.expect((try solve(line(0, 32768), 1, 2)) != null);
    try std.testing.expect((try solve(line(0, 32768), 1, 3)) == null);
    try std.testing.expect((try solve(line(65536, 131072), 1, 1)) != null);
    try std.testing.expect((try solve(line(65536, -131072), 0, 1)) != null);
    try std.testing.expect((try solve(line(65536, -131072), 1, 2)) == null);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, solve(line(65536, 0), 1, 0));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, solve(line(65536, 0), 2, 1));
}

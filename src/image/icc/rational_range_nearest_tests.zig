const std = @import("std");
const api = @import("rational_range_nearest.zig");
const I = @import("unit_interval.zig").WideInterval;
fn interval(n: u256, d: u256, en: u256, ed: u256, start: bool, end: bool) I {
    return .{ .start = .{ .numerator = n, .denominator = d }, .end = .{ .numerator = en, .denominator = ed }, .start_included = start, .end_included = end };
}
test "nearest range distinguishes an unattained infimum and an equally near actual ordinate" {
    const ranges = [_]I{ interval(0, 1, 1, 2, true, false), interval(1, 1, 1, 1, true, true) };
    try std.testing.expect((try api.select(.{ .numerator = 3, .denominator = 5 }, &ranges)) == .unattained);
    const equal = (try api.select(.{ .numerator = 3, .denominator = 4 }, &ranges)).nearest;
    try std.testing.expectEqual(@as(usize, 1), equal.count);
    try std.testing.expectEqual(.eq, try equal.values[0].order(.{ .numerator = 1, .denominator = 1 }));
    const inside = (try api.select(.{ .numerator = 1, .denominator = 4 }, &ranges)).nearest;
    try std.testing.expectEqual(.eq, try inside.values[0].order(.{ .numerator = 1, .denominator = 4 }));
}
test "nearest ties are distinct sorted actual values independent of input order" {
    var ranges = [_]I{ interval(1, 1, 1, 1, true, true), interval(0, 1, 0, 1, true, true), interval(0, 2, 0, 2, true, true) };
    for (0..3) |_| {
        const result = (try api.select(.{ .numerator = 1, .denominator = 2 }, &ranges)).nearest;
        try std.testing.expectEqual(@as(usize, 2), result.count);
        try std.testing.expectEqual(.eq, try result.values[0].order(.{ .numerator = 0, .denominator = 1 }));
        try std.testing.expectEqual(.eq, try result.values[1].order(.{ .numerator = 1, .denominator = 1 }));
        std.mem.rotate(I, &ranges, 1);
    }
    const max = std.math.maxInt(u128);
    const close = (try api.select(.{ .numerator = max / 2, .denominator = max }, &ranges)).nearest;
    try std.testing.expectEqual(@as(usize, 1), close.count);
    try std.testing.expectEqual(@as(u256, 0), close.values[0].numerator);
}
test "nearest validates all ranges before returning even an exact hit" {
    const ranges = [_]I{ interval(0, 1, 1, 1, true, true), interval(0, 0, 1, 1, true, true) };
    try std.testing.expectError(error.InvalidIccCurveCoordinate, api.select(.{ .numerator = 1, .denominator = 2 }, &ranges));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, api.select(.{ .numerator = 1, .denominator = 0 }, &.{}));
    try std.testing.expect((try api.select(.{ .numerator = 0, .denominator = 1 }, &.{})) == .empty);
    const open_point = [_]I{interval(1, 2, 1, 2, false, true)};
    try std.testing.expectError(error.EmptyIccInterval, api.select(.{ .numerator = 1, .denominator = 2 }, &open_point));
}
test "wide nearest distance retains full cross product precision" {
    const m = std.math.maxInt(u256);
    const ranges = [_]I{ interval(m - 1, m, m - 1, m, true, true), interval(m - 2, m - 1, m - 2, m - 1, true, true) };
    const result = (try api.select(.{ .numerator = 0, .denominator = 1 }, &ranges)).nearest;
    try std.testing.expectEqual(@as(usize, 1), result.count);
    try std.testing.expectEqual(m - 2, result.values[0].numerator);
    const distance = @import("ordinate_distance.zig");
    try std.testing.expectEqual(.gt, try distance.compare(.{ .numerator = std.math.maxInt(u128) / 2, .denominator = std.math.maxInt(u128) }, ranges[0].start, ranges[1].start));
}

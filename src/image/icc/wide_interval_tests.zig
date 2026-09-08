const std = @import("std");
const F = @import("fraction.zig").WideFraction;
const I = @import("unit_interval.zig").WideInterval;
const zero = F{ .numerator = 0, .denominator = 1 };
const half = F{ .numerator = 1, .denominator = 2 };
const one = F{ .numerator = 1, .denominator = 1 };
test "wide normalized fractions use exact full-width cross products" {
    const max = std.math.maxInt(u256);
    const almost = F{ .numerator = max - 1, .denominator = max };
    try std.testing.expectEqual(.lt, try almost.order(one));
    try std.testing.expectEqual(.eq, try (F{ .numerator = max, .denominator = max }).order(one));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, (F{ .numerator = 1, .denominator = 0 }).validate());
}
test "interval intersection retains endpoint ownership and empty intersections" {
    for ([_]bool{ false, true }) |left_closed| for ([_]bool{ false, true }) |right_closed| {
        const left = I{ .start = zero, .end = half, .end_included = left_closed };
        const right = I{ .start = half, .end = one, .start_included = right_closed };
        const result = try left.intersection(right);
        try std.testing.expectEqual(left_closed and right_closed, result != null);
        const reversed = try right.intersection(left);
        try std.testing.expectEqual(result != null, reversed != null);
        if (result) |point| {
            try std.testing.expectEqual(.eq, try point.start.order(half));
            try std.testing.expectEqual(.eq, try point.end.order(half));
            try std.testing.expect(point.start_included and point.end_included);
        }
    };
    const closed = I{ .start = zero, .end = one };
    const opened = I{ .start = zero, .end = one, .start_included = false, .end_included = false };
    const result = (try closed.intersection(opened)).?;
    try std.testing.expect(!result.start_included and !result.end_included);
    try std.testing.expectError(error.EmptyIccInterval, closed.intersection(.{ .start = half, .end = half, .end_included = false }));
}

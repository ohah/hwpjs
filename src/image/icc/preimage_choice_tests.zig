const std = @import("std");
const select = @import("preimage_choice.zig").select;
const I = @import("unit_interval.zig").WideInterval;
test "flat preimage selection requires attained extrema not closure points" {
    var interval = I{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 2 } };
    try std.testing.expectEqual(.eq, try (try select(interval)).order(interval.end));
    interval.end_included = false;
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, select(interval));
    interval.end = .{ .numerator = 1, .denominator = 1 };
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, select(interval));
    interval.end_included = true;
    interval.start = .{ .numerator = 1, .denominator = 2 };
    try std.testing.expectEqual(.eq, try (try select(interval)).order(interval.start));
    interval.start_included = false;
    try std.testing.expectError(error.UnattainedIccPreimageMinimum, select(interval));
    interval.start = interval.end;
    try std.testing.expectError(error.EmptyIccInterval, select(interval));
}

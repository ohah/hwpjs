const std = @import("std");
const trend = @import("parametric_trend.zig");
fn check(values: [7]i32, expected: trend.Trend) !void {
    try std.testing.expectEqual(expected, try trend.inspect(256, .{ .function = .type4, .values = values }));
}
test "whole curve trend distinguishes clipped folds and boundary jumps" {
    try check(.{ 131072, 131072, -65536, 0, 0, 0, 0 }, .nonmonotonic);
    try check(.{ 131072, 131072, -65536, 0, 0, 65536, 0 }, .constant);
    try check(.{ 131072, 131072, -65536, 0, 0, -65536, 0 }, .constant);
    try check(.{ 65536, 65536, 0, 131072, 32768, 0, 0 }, .nonmonotonic);
    try check(.{ 65536, 0, 0, 0, 32768, 65536, 0 }, .nondecreasing);
    try check(.{ 65536, 0, 0, 65536, 32768, 65536, 0 }, .nondecreasing);
    try check(.{ 65536, 0, 0, 0, 65536, 65536, 0 }, .nondecreasing);
}
test "whole curve trend retains tiny variations and decreasing curves" {
    try check(.{ 131072, 2147483647, -1, 0, 0, 0, 0 }, .nonmonotonic);
    try check(.{ 131072, 2147483647, -1, 0, 0, -65536, 0 }, .nondecreasing);
    try check(.{ 65536, -65536, 65536, 0, 0, 0, 0 }, .nonincreasing);
    try check(.{ 65536, 0, 0, 0, 32768, 0, 65536 }, .nonincreasing);
    try check(.{ 0, 0, 65536, 0, 32768, -32768, 32768 }, .constant);
    try check(.{ 2147483647, 32768, 0, 0, 0, 0, 0 }, .nondecreasing);
    try check(.{ -2147483648, 0, 131072, 0, 32768, 0, 0 }, .nondecreasing);
    try std.testing.expectError(error.UndefinedIccCurvePower, trend.inspect(256, .{ .function = .type0, .values = .{ 0, 0, 0, 0, 0, 0, 0 } }));
}

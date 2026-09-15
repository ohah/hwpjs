const std = @import("std");

pub const Range = struct { start: u32, count: u32, end: u32 };

pub fn validate(start: u32, count: u32, height: u32) !Range {
    const end = std.math.add(u32, start, count) catch return error.InvalidEmfScanlineRange;
    if (end > height) return error.InvalidEmfScanlineRange;
    return .{ .start = start, .count = count, .end = end };
}

test "scanline range distinguishes exact edge zero count and overflow" {
    try std.testing.expectEqual(@as(u32, 4), (try validate(2, 2, 4)).end);
    try std.testing.expectEqual(@as(u32, 4), (try validate(4, 0, 4)).end);
    try std.testing.expectError(error.InvalidEmfScanlineRange, validate(5, 0, 4));
    try std.testing.expectError(error.InvalidEmfScanlineRange, validate(std.math.maxInt(u32), 1, std.math.maxInt(u32)));
}

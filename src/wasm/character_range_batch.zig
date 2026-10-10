//! 여러 문단 서식 요청의 공통 little-endian 선택 구간입니다.
const std = @import("std");

pub const Range = struct { section: u32, paragraph: u32, start: u32, end: u32 };
pub const max_ranges = 4096;
const stride = 16;

/// 포맷별 문단 번호 변환과 소유권 검사는 호출자가 담당합니다.
pub fn decode(a: std.mem.Allocator, bytes: []const u8) ![]Range {
    if (bytes.len % stride != 0) return error.InvalidTextPosition;
    const count = bytes.len / stride;
    if (count > max_ranges) return error.LimitExceeded;
    const ranges = try a.alloc(Range, count);
    errdefer a.free(ranges);
    for (ranges, 0..) |*range, i| {
        const item = bytes[i * stride ..][0..stride];
        range.* = .{
            .section = std.mem.readInt(u32, item[0..4], .little),
            .paragraph = std.mem.readInt(u32, item[4..8], .little),
            .start = std.mem.readInt(u32, item[8..12], .little),
            .end = std.mem.readInt(u32, item[12..16], .little),
        };
        if (range.end < range.start) return error.InvalidTextPosition;
    }
    return ranges;
}

test "character range batch decodes unaligned wire and rejects late reversed range" {
    const a = std.testing.allocator;
    var buffer: [33]u8 = @splat(0);
    const bytes = buffer[1..];
    std.mem.writeInt(u32, bytes[0..4], 2, .little);
    std.mem.writeInt(u32, bytes[4..8], 7, .little);
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[12..16], 9, .little);
    const ranges = try decode(a, bytes);
    defer a.free(ranges);
    try std.testing.expectEqual(@as(usize, 2), ranges.len);
    try std.testing.expectEqualDeep(Range{ .section = 2, .paragraph = 7, .start = 1, .end = 9 }, ranges[0]);
    std.mem.writeInt(u32, bytes[24..28], 1, .little);
    try std.testing.expectError(error.InvalidTextPosition, decode(a, bytes));
    try std.testing.expectError(error.InvalidTextPosition, decode(a, bytes[0..31]));
}

test "character range batch bounds empty input and allocation failures" {
    const a = std.testing.allocator;
    const empty = try decode(a, &.{});
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    const oversized = try a.alloc(u8, (max_ranges + 1) * stride);
    defer a.free(oversized);
    try std.testing.expectError(error.LimitExceeded, decode(a, oversized));
    @memset(oversized, 0);
    const maximum = try decode(a, oversized[0 .. max_ranges * stride]);
    defer a.free(maximum);
    try std.testing.expectEqual(@as(usize, max_ranges), maximum.len);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const result = try decode(allocator, &@as([16]u8, @splat(0)));
            defer allocator.free(result);
            try std.testing.expectEqual(@as(usize, 1), result.len);
        }
    }.run, .{});
}

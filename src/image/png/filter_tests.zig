const std = @import("std");
const filter = @import("filter.zig");
const t = std.testing;

test "PNG Paeth exhaustive byte triples with independent nearest candidate oracle" {
    for (0..256) |a| for (0..256) |b| for (0..256) |c| {
        const candidates = [_]i32{ @intCast(a), @intCast(b), @intCast(c) };
        const estimate = candidates[0] + candidates[1] - candidates[2];
        var best: usize = 0;
        for (1..3) |i| {
            if (@abs(estimate - candidates[i]) < @abs(estimate - candidates[best])) best = i;
        }
        try t.expectEqual(@as(u8, @intCast(candidates[best])), filter.paeth(@intCast(a), @intCast(b), @intCast(c)));
    };
}

test "PNG filters wrapping average and first row boundaries" {
    const prior = [_]u8{ 255, 129, 0, 254, 71, 12 };
    const input = [_]u8{ 255, 128, 1, 254, 3, 99 };
    const expected = [_][6]u8{
        .{ 255, 128, 1, 254, 3, 99 },
        .{ 255, 128, 0, 126, 3, 225 },
        .{ 254, 1, 1, 252, 74, 111 },
        .{ 126, 192, 64, 221, 70, 215 },
        .{ 254, 1, 1, 127, 74, 111 },
    };
    for (expected, 0..) |want, kind| {
        var row = input;
        try filter.restore(@intCast(kind), 2, &row, &prior);
        try t.expectEqualSlices(u8, &want, &row);
    }
    for (0..5) |kind| {
        var row = input;
        var zeros: [6]u8 = @splat(0);
        var with_zeros = input;
        try filter.restore(@intCast(kind), 2, &row, null);
        try filter.restore(@intCast(kind), 2, &with_zeros, &zeros);
        try t.expectEqualSlices(u8, &row, &with_zeros);
    }
}

test "PNG filter rejection leaves destination unchanged including overlapping views" {
    var bytes = [_]u8{ 1, 2, 3, 4 };
    const original = bytes;
    for (5..256) |kind| try t.expectError(error.InvalidPngFilter, filter.restore(@intCast(kind), 1, &bytes, null));
    for ([_]usize{ 0, 9, std.math.maxInt(usize) }) |stride|
        try t.expectError(error.InvalidPngFilterStride, filter.restore(0, stride, &bytes, null));
    try t.expectError(error.InvalidPngPreviousRow, filter.restore(0, 1, &bytes, &.{1}));
    try t.expectError(error.OverlappingPngRows, filter.restore(0, 1, &bytes, &bytes));
    try t.expectError(error.OverlappingPngRows, filter.restore(0, 1, bytes[0..3], bytes[1..4]));
    try t.expectError(error.OverlappingPngRows, filter.restore(0, 1, bytes[1..4], bytes[0..3]));
    try t.expectEqualSlices(u8, &original, &bytes);
    try filter.restore(0, 1, bytes[0..2], bytes[2..4]);
    try filter.restore(0, 1, bytes[0..0], bytes[0..0]);
}

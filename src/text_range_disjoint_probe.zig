const std = @import("std");
const ranges = @import("hwp5/edit/text_ranges.zig");
const Range = @import("model/document.zig").TextRange;
const before = [_]u8{ 'a', 0, 'b', 0, 'c', 0, 'd', 0, 'e', 0, 13, 0 };

test "disjoint range mapping exhausts endpoints without selecting boundary affinity" {
    const a = std.testing.allocator;
    for (0..6) |first| for (first..6) |last| {
        const source = [_]Range{.{ .start_unit = @intCast(first), .end_unit = @intCast(last), .tag = 0x0100000e }};
        for (0..6) |start| for (start..6) |end| {
            const allowed = end < first or start > last;
            const result = ranges.prepareDisjoint(a, &source, null, &before, @intCast(start), @intCast(end), 3);
            if (!allowed) {
                if (result) |unexpected| {
                    a.free(unexpected);
                    return error.ExpectedBoundaryRefusal;
                } else |err| try std.testing.expectEqual(error.UnsupportedRangeSemantics, err);
                continue;
            }
            const mapped = try result;
            defer a.free(mapped);
            const shift = if (end < first) 3 - @as(i64, @intCast(end - start)) else 0;
            try std.testing.expectEqual(@as(usize, 1), mapped.len);
            try std.testing.expectEqual(@as(u32, @intCast(@as(i64, @intCast(first)) + shift)), mapped[0].start_unit);
            try std.testing.expectEqual(@as(u32, @intCast(@as(i64, @intCast(last)) + shift)), mapped[0].end_unit);
            try std.testing.expectEqual(source[0].tag, mapped[0].tag);
        };
    };
}

fn verifyAllocation(a: std.mem.Allocator) !void {
    const source = [_]Range{
        .{ .start_unit = 3, .end_unit = 3, .tag = 0 },
        .{ .start_unit = 3, .end_unit = 5, .tag = 0xffffffff },
    };
    const mapped = try ranges.prepareDisjoint(a, &source, null, &before, 0, 1, 2);
    defer a.free(mapped);
    try std.testing.expectEqual(@as(usize, 2), mapped.len);
    try std.testing.expectEqual(@as(u32, 4), mapped[0].start_unit);
    try std.testing.expectEqual(@as(u32, 4), mapped[0].end_unit);
    try std.testing.expectEqual(source[1].tag, mapped[1].tag);
}

test "disjoint range allocation failures preserve empty markers and reject current overlaps" {
    const a = std.testing.allocator;
    try @import("testing/allocation_failures.zig").check(verifyAllocation, .{});
    const current = [_]Range{.{ .start_unit = 0, .end_unit = 5, .tag = 0 }};
    try std.testing.expectError(error.UnsupportedRangeSemantics, ranges.prepareDisjoint(a, &current, null, &before, 0, 0, 1));
    try std.testing.expectError(error.InvalidTextRange, ranges.prepareDisjoint(a, &current, null, &before, 2, 1, 1));
    try std.testing.expectError(error.LimitExceeded, ranges.prepareDisjoint(a, null, null, &before, 0, 0, std.math.maxInt(u32)));
}

test "disjoint range current model wins over raw source and late refusal releases staging" {
    const a = std.testing.allocator;
    var raw: [12]u8 = @splat(0);
    std.mem.writeInt(u32, raw[0..4], 3, .little);
    std.mem.writeInt(u32, raw[4..8], 5, .little);
    const source = try @import("hwp5/body/reader.zig").Ranges.parse(&raw);
    const current = [_]Range{.{ .start_unit = 0, .end_unit = 5, .tag = 0 }};
    try std.testing.expectError(error.UnsupportedRangeSemantics, ranges.prepareDisjoint(a, &current, source, &before, 0, 0, 1));
    const cleared: [0]Range = .{};
    const mapped = try ranges.prepareDisjoint(a, &cleared, source, &before, 0, 0, 1);
    defer a.free(mapped);
    try std.testing.expectEqual(@as(usize, 0), mapped.len);
    const late = [_]Range{
        .{ .start_unit = 3, .end_unit = 5, .tag = 0 },
        .{ .start_unit = 0, .end_unit = 1, .tag = 1 },
    };
    try std.testing.expectError(error.UnsupportedRangeSemantics, ranges.prepareDisjoint(a, &late, null, &before, 1, 1, 1));
    const unicode = [_]u8{ 'a', 0, 0x3d, 0xd8, 0, 0xde, 'b', 0, 13, 0 };
    try std.testing.expectError(error.SplitSurrogatePair, ranges.prepareDisjoint(a, null, null, &unicode, 2, 2, 1));
}

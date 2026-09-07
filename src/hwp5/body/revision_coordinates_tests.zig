const std = @import("std");
const t = std.testing;
const Map = @import("revision_coordinates.zig").Map;
const Ranges = @import("range_tags.zig").Ranges;
fn span(a: u32, b: u32, kind: u8) [12]u8 {
    var raw = [_]u8{0} ** 12;
    std.mem.writeInt(u32, raw[0..4], a, .little);
    std.mem.writeInt(u32, raw[4..8], b, .little);
    raw[11] = kind;
    return raw;
}
test "coordinate map exhaustively matches independent union masks at every boundary" {
    for (0..7) |a| for (a..7) |b| {
        for (0..7) |c| for (c..7) |d| {
            const raw = span(@intCast(a), @intCast(b), 17) ++ span(@intCast(c), @intCast(d), 17);
            var map = try Map.buildObserved(t.allocator, 6, try Ranges.parse(&raw), 2);
            defer map.deinit(t.allocator);
            var kept: u32 = 0;
            for (0..7) |unit| {
                const removed = (a <= unit and unit < b) or (c <= unit and unit < d);
                const actual = try map.mapBoundary(@intCast(unit));
                try t.expectEqual(kept, actual.offset);
                try t.expectEqual(removed, actual.removed_unit);
                if (unit < 6 and !removed) kept += 1;
            }
            try t.expectEqual(kept, map.projected_units);
            try t.expectError(error.RevisionCoordinateOutOfBounds, map.mapBoundary(7));
        };
    };
}
test "coordinate maps handle UINT32 endpoints without text-sized allocation" {
    for ([_]u32{ 0, 0xfffffffe }) |start| {
        const raw = span(start, 0xffffffff, 17);
        var map = try Map.buildObserved(t.allocator, 0xffffffff, try Ranges.parse(&raw), 1);
        defer map.deinit(t.allocator);
        try t.expectEqual(start, map.projected_units);
        const before = try map.mapBoundary(0xfffffffe);
        try t.expectEqual(start, before.offset);
        try t.expect(before.removed_unit);
        const end = try map.mapBoundary(0xffffffff);
        try t.expectEqual(start, end.offset);
        try t.expect(!end.removed_unit);
    }
    var identity = try Map.buildObserved(t.allocator, 0xffffffff, try Ranges.parse(&.{}), 0);
    defer identity.deinit(t.allocator);
    try t.expectEqual(@as(u32, 0xffffffff), (try identity.mapBoundary(0xffffffff)).offset);
}
fn owned(a: std.mem.Allocator) !void {
    var raw = span(1, 2, 17) ++ span(3, 5, 17);
    var map = try Map.buildObserved(a, 6, try Ranges.parse(&raw), 2);
    defer map.deinit(a);
    @memset(&raw, 0xff);
    try t.expectEqual(@as(u32, 2), (try map.mapBoundary(4)).offset);
    try t.expect((try map.mapBoundary(4)).removed_unit);
}
test "coordinate maps own intervals and clean allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, owned, .{});
    const raw = span(0, 2, 18);
    var map = try Map.buildObserved(t.allocator, 2, try Ranges.parse(&raw), 1);
    defer map.deinit(t.allocator);
    try t.expectEqual(@as(u32, 1), (try map.mapBoundary(1)).offset);
    try t.expect(!(try map.mapBoundary(1)).removed_unit);
    try t.expectError(error.RevisionProjectionRangeLimit, Map.buildObserved(t.allocator, 2, try Ranges.parse(&raw), 0));
    try t.expectError(error.InvalidRangePosition, Map.buildObserved(t.allocator, 1, try Ranges.parse(&raw), 1));
}

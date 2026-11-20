const std = @import("std");
const a = std.testing.allocator;
const Change = @import("xml_source_writer.zig").Change;
const Cursor = @import("source_change_coverage.zig").Cursor;

fn oracle(changes: []const Change, start: usize, end: usize) bool {
    for (changes) |change| if (change.start <= start and change.end >= end) return true;
    return false;
}
fn owned(a0: std.mem.Allocator) !void {
    var changes = [_]Change{
        .{ .start = 90, .end = 140, .text = "" },
        .{ .start = 0, .end = 100, .text = "" },
        .{ .start = 70, .end = 70, .text = "" },
        .{ .start = 10, .end = 20, .text = "" },
    };
    var cursor = try Cursor.init(a0, &changes);
    defer cursor.deinit(a0);
    // The caller can append/reallocate/free its change inventory afterwards.
    // Coverage owns only numeric spans, never source bytes or edit authority.
    @memset(&changes, .{ .start = 0, .end = 0, .text = "changed" });
    try std.testing.expect(try cursor.covers(0, 99));
    try std.testing.expect(try cursor.covers(89, 100));
    try std.testing.expect(try cursor.covers(90, 140));
    try std.testing.expect(!try cursor.covers(141, 142));
}
test "title source linear coverage owns sparse intervals through all allocation failures" {
    try owned(a);
    try @import("../testing/allocation_failures.zig").check(owned, .{});
    const huge = [_]Change{.{ .start = std.math.maxInt(usize) - 1, .end = std.math.maxInt(usize), .text = "" }};
    var sparse = try Cursor.init(a, &huge);
    defer sparse.deinit(a);
    try std.testing.expect(!try sparse.covers(0, 1));
    try std.testing.expect(try sparse.covers(std.math.maxInt(usize) - 1, std.math.maxInt(usize)));
}
test "title source linear coverage matches old exhaustive predicate with bounded visits" {
    for ([_]usize{ 0, 1, 8, 257 }) |count| {
        const changes = try a.alloc(Change, count);
        defer a.free(changes);
        for (changes, 0..) |*change, i| {
            const start = (i * 73) % 300;
            change.* = .{ .start = start, .end = start + (i % 13), .text = "" };
        }
        var cursor = try Cursor.init(a, changes);
        defer cursor.deinit(a);
        for (0..400) |start|
            try std.testing.expectEqual(oracle(changes, start, start + 1), try cursor.covers(start, start + 1));
        try std.testing.expect(cursor.work.consumed <= count);
        try std.testing.expectEqual(@as(usize, 400), cursor.work.queries);
        try std.testing.expectEqual(if (count <= 1) @as(usize, 0) else 2 * @sizeOf(usize) * count, cursor.work.radix_items);
    }
}
test "title source linear coverage does not relax writer duplicate or overlap guards" {
    const duplicate = [_]Change{
        .{ .start = 0, .end = 0, .text = "" },
        .{ .start = 0, .end = 0, .text = "" },
    };
    var cursor = try Cursor.init(a, &duplicate);
    defer cursor.deinit(a);
    try std.testing.expect(try cursor.covers(0, 0));
    try std.testing.expectError(error.DuplicateSourceSpan, @import("xml_source_writer.zig").write(a, "abc", &duplicate, 100));
    try std.testing.expect(!try cursor.covers(0, 2));
    try std.testing.expect(!try cursor.covers(2, 2));
    try std.testing.expectError(error.InvalidSourceSpan, cursor.covers(1, 2));
    try std.testing.expectError(error.InvalidSourceSpan, cursor.covers(3, 2));
    const overlap = [_]Change{
        .{ .start = 0, .end = 2, .text = "" },
        .{ .start = 1, .end = 3, .text = "" },
    };
    try std.testing.expectError(error.InvalidSourceSpan, @import("xml_source_writer.zig").write(a, "abc", &overlap, 100));
    const invalid = [_]Change{.{ .start = 9, .end = 8, .text = "" }};
    try std.testing.expectError(error.InvalidSourceSpan, Cursor.init(a, &invalid));
}

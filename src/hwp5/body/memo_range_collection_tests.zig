const std = @import("std");
const t = std.testing;
const Collection = @import("memo_range_collection.zig").Collection;
const ranges = @import("memo_ranges.zig");
fn fixture() [87]u8 {
    var b = [_]u8{0} ** 87;
    for ([_][2]u32{ .{ 0, 66 | (24 << 20) }, .{ 28, 67 | (1 << 10) | (32 << 20) }, .{ 64, 71 | (1 << 10) | (19 << 20) }, .{ 34, 0x25256d65 }, .{ 50, 0x00256d65 }, .{ 58, 7 }, .{ 68, 0x25256d65 }, .{ 79, 5 }, .{ 83, 7 } }) |row| std.mem.writeInt(u32, b[row[0]..][0..4], row[1], .little);
    for ([_][2]usize{ .{ 32, 3 }, .{ 46, 3 }, .{ 48, 4 }, .{ 62, 4 } }) |row| std.mem.writeInt(u16, b[row[0]..][0..2], @intCast(row[1]), .little);
    return b;
}
fn exercise(a: std.mem.Allocator) !void {
    const bytes = fixture() ++ fixture();
    var tree = try @import("tree.zig").Tree.parse(a, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var links = try @import("control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    std.mem.reverse(@import("control_links.zig").Link, links.items);
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var refs: @import("../memo_references.zig").Index = .{};
    defer refs.deinit(a);
    var collection: Collection = .{};
    defer collection.deinit(a);
    for (0..2) |section| {
        const begin = collection.events.items.len;
        const collector: @import("../memo_references.zig").Collector = .{ .index = &refs, .allocator = a, .section = section, .ranges = &collection };
        _ = try @import("field_validation.zig").inspectCollected(tree, collector);
        try @import("memo_end_collection.zig").collect(tree, collector);
        try collection.resolveSection(a, section, begin, tree, groups.items, links.items);
        try t.expectEqual(@as(usize, 0), collection.starts.items.len);
    }
    try t.expectEqualDeep(ranges.Report{ .starts = 4, .ends = 4, .pairs = 4 }, try ranges.inspect(a, collection.events.items));
    try t.expectEqual(@as(usize, 4), refs.fields.items.len);
    try t.expectEqual(@as(usize, 4), refs.ends.items.len);
}
test "memo event collection reuses field and text parsing across sections with allocation cleanup" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "memo event collection rejects missing duplicate links and unordered starts" {
    const a = t.allocator;
    const b = fixture();
    var tree = try @import("tree.zig").Tree.parse(a, &b, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var links = try @import("control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    {
        var c: Collection = .{};
        defer c.deinit(a);
        try c.addStart(a, 2, null);
        try t.expectError(error.InvalidMemoStartOrder, c.addStart(a, 2, 0));
        try t.expectError(error.InvalidMemoStartOrder, c.addStart(a, 1, 0));
        try t.expectError(error.InvalidMemoEventBoundary, c.resolveSection(a, 0, 1, tree, &.{}, links.items));
        try t.expectError(error.MissingMemoStartLink, c.resolveSection(a, 0, 0, tree, &.{}, &.{}));
    }
    {
        var c: Collection = .{};
        defer c.deinit(a);
        try c.addStart(a, 2, 0);
        try t.expectError(error.DuplicateMemoStartLink, c.resolveSection(a, 0, 0, tree, &.{}, &.{ links.items[0], links.items[0] }));
    }
}

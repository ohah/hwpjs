const std = @import("std");
const t = std.testing;
const lists = @import("list_groups.zig");
test "owner cursor skips unrelated owners and returns all direct groups once" {
    const groups = [_]lists.Group{
        .{ .parent_node = 0, .header_node = 1, .begin = 0, .end = 0 },
        .{ .parent_node = 2, .header_node = 3, .begin = 0, .end = 0 },
        .{ .parent_node = 2, .header_node = 5, .begin = 0, .end = 0 },
        .{ .parent_node = 9, .header_node = 10, .begin = 0, .end = 0 },
    };
    var cursor: lists.OwnerCursor = .{ .groups = &groups };
    try t.expectEqual(0, cursor.take(1).len);
    try t.expectEqualSlices(lists.Group, groups[1..3], cursor.take(2));
    try t.expectEqual(0, cursor.take(2).len);
    try t.expectEqual(0, cursor.take(8).len);
    try t.expectEqualSlices(lists.Group, groups[3..], cursor.take(9));
    try t.expectEqual(0, cursor.take(10).len);
}
fn allocationCase(a: std.mem.Allocator, bad: bool) !void {
    var raw = [_]u8{0} ** 20;
    std.mem.writeInt(u32, raw[0..4], 71 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").id("tcmt"), .little);
    std.mem.writeInt(u32, raw[8..12], 72 | (1 << 10) | (8 << 20), .little);
    var tree = try @import("tree.zig").Tree.parse(a, raw[0..if (bad) 8 else 20], .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(a);
    var groups = try lists.Groups.build(a, tree);
    defer groups.deinit(a);
    const result = @import("hidden_comment.zig").inspect(tree, groups.items, .observed8);
    if (bad) try t.expectError(error.MissingHiddenCommentList, result) else try t.expectEqual(1, (try result).lists);
}
test "hidden comment tree and groups allocation cleanup with missing list" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}

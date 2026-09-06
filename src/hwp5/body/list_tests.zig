const std = @import("std");
const t = std.testing;
const Tree = @import("tree.zig").Tree;
const Groups = @import("list_groups.zig").Groups;
fn fixture() [92]u8 {
    var bytes = [_]u8{0} ** 92;
    const offsets = [_]usize{ 0, 28, 36, 48, 52, 80 };
    const words = [_]u32{ 66 | (24 << 20), 71 | (1 << 10) | (4 << 20), 72 | (2 << 10) | (8 << 20), 900 | (2 << 10), 66 | (2 << 10) | (24 << 20), 72 | (2 << 10) | (8 << 20) };
    for (offsets, words) |p, w| std.mem.writeInt(u32, bytes[p..][0..4], w, .little);
    bytes[40] = 1;
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = fixture();
    var tree = try Tree.parse(a, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    try t.expectEqual(2, groups.items.len);
    const g = groups.items[0];
    try t.expectEqual(2, g.header_node);
    try t.expectEqual(1, g.parent_node);
    try t.expectEqual(3, g.begin);
    try t.expectEqual(5, g.end);
    try t.expectEqual(1, g.paragraph_count);
    try t.expectEqual(1, g.intervening_records);
    try t.expectEqual(0, groups.items[1].paragraph_count);
}
test "list grouping cleans every allocation failure and keeps intervening records" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
}
test "late list count mismatch releases partial grouping" {
    var bytes = fixture();
    bytes[84] = 255;
    bytes[85] = 255;
    var tree = try Tree.parse(t.allocator, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(t.allocator);
    try t.expectError(error.ListParagraphCountMismatch, Groups.build(t.allocator, tree));
}

const std = @import("std");
const t = std.testing;
const Tree = @import("tree.zig").Tree;
const version = @import("../version.zig").Version{ .raw = 0x05000307 };
fn allocationCase(a: std.mem.Allocator) !void {
    var bytes: [4096]u8 = undefined;
    for (0..1024) |i| std.mem.writeInt(u32, bytes[i * 4 ..][0..4], 1023 | (@as(u32, @intCast(i)) << 10), .little);
    var tree = try Tree.parse(a, &bytes, version, .{});
    defer tree.deinit(a);
    try t.expectEqual(1024, tree.nodes.len);
    for (tree.nodes, 0..) |node, i| {
        try t.expectEqual(1024, node.subtree_end);
        if (i == 0) try t.expect(node.parent == null) else try t.expectEqual(i - 1, node.parent.?);
    }
}
test "tree supports maximum wire depth without recursion and cleans every allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
}
test "tree sibling and root closures, unknown bytes and malformed cleanup" {
    var bytes: [20]u8 = undefined;
    for ([_]u32{ 0, 1, 2, 1, 0 }, 0..) |level, i| std.mem.writeInt(u32, bytes[i * 4 ..][0..4], 1023 | (level << 10), .little);
    var tree = try Tree.parse(t.allocator, &bytes, version, .{});
    defer tree.deinit(t.allocator);
    for ([_]usize{ 4, 3, 3, 4, 5 }, 0..) |end, i| try t.expectEqual(end, tree.nodes[i].subtree_end);
    try t.expect(tree.nodes[4].parent == null);
    try t.expectEqual(0, tree.nodes[3].parent.?);
    try t.expectEqualSlices(u8, bytes[8..12], tree.nodes[2].record.framing.raw);
    try t.expectError(error.LimitExceeded, Tree.parse(t.allocator, &bytes, version, .{ .max_records = 4 }));
    try t.expectError(error.UnexpectedEnd, Tree.parse(t.allocator, bytes[0..19], version, .{}));
    std.mem.writeInt(u32, bytes[16..20], 1023 | (3 << 10), .little);
    try t.expectError(error.InvalidRecordHierarchy, Tree.parse(t.allocator, &bytes, version, .{}));
}

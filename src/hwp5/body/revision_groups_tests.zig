const std = @import("std");
const t = std.testing;
const Tree = @import("tree.zig").Tree;
const Lists = @import("list_groups.zig").Groups;
const Flows = @import("paragraph_flows.zig").Flows;
const Index = @import("revision_groups.zig").Index;
fn fixture(bad: bool) [124]u8 {
    var b = [_]u8{0} ** 124;
    for ([_][4]u32{ .{ 0, 0, 3, 0 }, .{ 40, 1, 4, 0 }, .{ 68, 1, 5, 1 }, .{ 96, 0, 6, if (bad) 2 else 1 } }) |row| {
        const at = row[0];
        std.mem.writeInt(u32, b[at..][0..4], 66 | (row[1] << 10) | (24 << 20), .little);
        std.mem.writeInt(u32, b[at + 4 ..][0..4], row[2], .little);
        std.mem.writeInt(u16, b[at + 26 ..][0..2], @intCast(row[3]), .little);
    }
    std.mem.writeInt(u32, b[28..32], 72 | (1 << 10) | (8 << 20), .little);
    b[32] = 2;
    return b;
}
fn exercise(a: std.mem.Allocator, bad: bool) !void {
    const bytes = fixture(bad);
    var tree = try Tree.parse(a, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var lists = try Lists.build(a, tree);
    defer lists.deinit(a);
    var flows = try Flows.build(a, tree, lists.items);
    defer flows.deinit(a);
    var index = Index.buildObserved(a, tree, flows) catch |err| {
        if (bad and err == error.UnsupportedRevisionMergeValue) return;
        return err;
    };
    defer index.deinit(a);
    try t.expect(!bad);
    try t.expectEqual(@as(usize, 2), index.groups.len);
    try t.expectEqual(@as(usize, 4), index.members.len);
    for (index.groups) |g| {
        try t.expectEqual(@as(usize, 2), g.member_count);
        try t.expectEqual(@as(u64, 9), g.source_units);
    }
    try t.expectEqual(@as(u64, 3), index.members[3].source_start);
    try t.expectEqual(@as(usize, 0), index.members[3].group_index);
    try t.expectEqual(@as(u64, 4), index.members[2].source_start);
}
test "revision groups preserve independent flows with allocation cleanup on success and late failure" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "revision groups reject absent markers orphan scopes and mismatched flow bounds" {
    const a = t.allocator;
    const bytes = fixture(false);
    var tree = try Tree.parse(a, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var lists = try Lists.build(a, tree);
    defer lists.deinit(a);
    var flows = try Flows.build(a, tree, lists.items);
    defer flows.deinit(a);
    tree.nodes[2].record.value.header.merge_tracking = 1;
    try t.expectError(error.OrphanRevisionMerge, Index.buildObserved(a, tree, flows));
    tree.nodes[2].record.value.header.merge_tracking = null;
    try t.expectError(error.UnsupportedRevisionMergeValue, Index.buildObserved(a, tree, flows));
    tree.nodes[2].record.value.header.merge_tracking = 0;
    flows.owners[2] = tree.nodes.len;
    try t.expectError(error.InvalidRevisionFlow, Index.buildObserved(a, tree, flows));
    flows.owners[2] = 0;
    try t.expectError(error.InvalidRevisionFlow, Index.buildObserved(a, tree, flows));
    try t.expectError(error.InvalidRevisionFlow, Index.buildObserved(a, tree, .{ .owners = flows.owners[0..1] }));
}

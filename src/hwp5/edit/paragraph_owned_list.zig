//! Explicit root-paragraph list ownership, without guessing list extension semantics.
const Tree = @import("../body/tree.zig").Tree;
const Groups = @import("../body/list_groups.zig").Groups;
pub fn validate(tree: Tree, groups: Groups, owner: usize, list: usize) !void {
    if (owner >= tree.nodes.len or list >= tree.nodes.len) return error.SourceBindingMismatch;
    const parent = tree.nodes[owner];
    if (parent.record.value != .header or parent.parent != null) return error.UnsupportedNestedParagraph;
    const header = tree.nodes[list];
    if (header.record.framing.tag != 72 or header.parent != owner or header.subtree_end != list + 1) return error.UnsupportedParagraphRecord;
    for (groups.items) |group| {
        if (group.header_node != list) continue;
        if (group.parent_node != owner or group.memo != null or group.intervening_records != 0 or group.paragraph_count == 0) return error.UnsupportedParagraphRecord;
        if (header.record.value != .list_header or header.record.value.list_header.count_raw != group.paragraph_count) return error.ListParagraphCountMismatch;
        return;
    }
    return error.OrphanListHeader;
}

test "paragraph owned list requires explicit root sibling count and rejects forged ownership" {
    const std = @import("std");
    const a = std.testing.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    var head = @as([24]u8, @splat(0));
    std.mem.writeInt(u32, head[0..4], 1, .little);
    var list = @as([8]u8, @splat(0));
    list[0] = 1;
    try @import("../record_writer.zig").append(a, &bytes, 66, 0, &head, 1024);
    try @import("../record_writer.zig").append(a, &bytes, 72, 1, &list, 1024);
    try @import("../record_writer.zig").append(a, &bytes, 66, 1, &head, 1024);
    var tree = try @import("source_tree.zig").parse(a, bytes.items, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(a);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    try validate(tree, groups, 0, 1);
    groups.items[0].intervening_records = 1;
    try std.testing.expectError(error.UnsupportedParagraphRecord, validate(tree, groups, 0, 1));
    groups.items[0].intervening_records = 0;
    groups.items[0].paragraph_count = 2;
    try std.testing.expectError(error.ListParagraphCountMismatch, validate(tree, groups, 0, 1));
    groups.items[0].paragraph_count = 1;
    tree.nodes[0].parent = 2;
    try std.testing.expectError(error.UnsupportedNestedParagraph, validate(tree, groups, 0, 1));
    tree.nodes[0].parent = null;
    tree.nodes[1].parent = null;
    try std.testing.expectError(error.UnsupportedParagraphRecord, validate(tree, groups, 0, 1));
    tree.nodes[1].parent = 0;
    tree.nodes[1].subtree_end = 3;
    try std.testing.expectError(error.UnsupportedParagraphRecord, validate(tree, groups, 0, 1));
    tree.nodes[1].subtree_end = 2;
    try std.testing.expectError(error.OrphanListHeader, validate(tree, .{ .items = &.{} }, 0, 1));
    try std.testing.expectError(error.SourceBindingMismatch, validate(tree, groups, 3, 1));
}

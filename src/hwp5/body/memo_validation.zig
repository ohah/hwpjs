const Tree = @import("tree.zig").Tree;
const Group = @import("list_groups.zig").Group;
pub const Report = struct { markers: usize = 0, paragraphs: usize = 0, extra_bytes: usize = 0 };
/// Requires Groups.build output for this unchanged Tree. Does not resolve memo IDs.
pub fn inspect(tree: Tree, groups: []const Group) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .memo_list) continue;
        const parent = node.parent orelse return error.OrphanMemoList;
        if (node.record.framing.level != 1 or tree.nodes[parent].record.value != .header)
            return error.OrphanMemoList;
        if (node.subtree_end != index + 1) return error.InvalidMemoListChildren;
        report.markers += 1;
        report.extra_bytes += node.record.value.memo_list.extra.len;
    }
    var paired: usize = 0;
    for (groups) |group| if (group.memo) |memo| {
        paired += 1;
        report.paragraphs += group.paragraph_count;
        report.extra_bytes += memo.header.extra.len;
    };
    // Groups.build pairs each marker with at most one following direct sibling.
    if (paired != report.markers) return error.MissingMemoListHeader;
    return report;
}

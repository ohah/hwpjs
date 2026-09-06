const Tree = @import("tree.zig").Tree;
const lists = @import("list_groups.zig");
const Layout = @import("list_header.zig").Layout;
const id = @import("control_rules.zig").id;
pub const Report = struct { controls: usize = 0, lists: usize = 0, paragraphs: usize = 0, header_bytes: usize = 0, list_extra_bytes: usize = 0, intervening_records: usize = 0 };
/// Structural inspection of available data, not security validity or hidden-content recovery.
pub fn inspect(tree: Tree, groups: []const lists.Group, layout: Layout) !Report {
    var report: Report = .{};
    var owners: lists.OwnerCursor = .{ .groups = groups };
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header or node.record.value.control_header.id != id("tcmt")) continue;
        const owned = owners.take(index);
        if (owned.len == 0) return error.MissingHiddenCommentList;
        report.controls += 1;
        report.header_bytes += node.record.value.control_header.properties.len;
        for (owned) |group| {
            const view = try tree.nodes[group.header_node].record.value.list_header.view(layout);
            report.lists += 1;
            report.paragraphs += group.paragraph_count;
            report.list_extra_bytes += view.extra.len;
            report.intervening_records += group.intervening_records;
        }
    }
    return report;
}

const Tree = @import("tree.zig").Tree;
const Group = @import("list_groups.zig").Group;
const hf = @import("header_footer.zig");
pub const Report = struct {
    controls: usize = 0,
    lists: usize = 0,
    paragraphs: usize = 0,
    reserved_page_kinds: usize = 0,
    extra_bytes: usize = 0,
};
/// Consumes Groups.build output for the same unchanged tree; does not rebuild grouping.
/// Observed split CTRL_HEADER/LIST_HEADER profile; not an inline 14-byte fallback.
pub fn inspect(tree: Tree, groups: []const Group, layout: @import("list_header.zig").Layout) !Report {
    var report: Report = .{};
    var owners: @import("list_groups.zig").OwnerCursor = .{ .groups = groups };
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header) continue;
        const control = node.record.value.control_header;
        if (!hf.supports(control.id)) continue;
        const props = try hf.Properties.parse(control.properties);
        report.controls += 1;
        report.extra_bytes += props.extra.len;
        if (props.pageKind() == 3) report.reserved_page_kinds += 1;
        const owned = owners.take(index);
        for (owned) |group| {
            const view = try tree.nodes[group.header_node].record.value.list_header.view(layout);
            const area = try hf.Area.parse(view.extra);
            report.extra_bytes += area.extra.len;
            report.lists += 1;
            report.paragraphs += group.paragraph_count;
        }
        if (owned.len == 0) return error.MissingHeaderFooterList;
    }
    return report;
}

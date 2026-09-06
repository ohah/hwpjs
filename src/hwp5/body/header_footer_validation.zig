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
    var group_index: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        while (group_index < groups.len and groups[group_index].parent_node < index) group_index += 1;
        if (node.record.value != .control_header) continue;
        const control = node.record.value.control_header;
        if (!hf.supports(control.id)) continue;
        const props = try hf.Properties.parse(control.properties);
        report.controls += 1;
        report.extra_bytes += props.extra.len;
        if (props.pageKind() == 3) report.reserved_page_kinds += 1;
        var found = false;
        var current = group_index;
        while (current < groups.len and groups[current].parent_node == index) : (current += 1) {
            const group = groups[current];
            const view = try tree.nodes[group.header_node].record.value.list_header.view(layout);
            const area = try hf.Area.parse(view.extra);
            report.extra_bytes += area.extra.len;
            report.lists += 1;
            report.paragraphs += group.paragraph_count;
            found = true;
        }
        if (!found) return error.MissingHeaderFooterList;
    }
    return report;
}

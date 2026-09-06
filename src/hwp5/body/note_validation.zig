const Tree = @import("tree.zig").Tree;
const lists = @import("list_groups.zig");
const note = @import("note_control.zig");
pub const Report = struct { footnotes: usize = 0, endnotes: usize = 0, lists: usize = 0, paragraphs: usize = 0, opaque_controls: usize = 0, header_extra_bytes: usize = 0, list_extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, groups: []const lists.Group, layout: note.Layout, list_layout: @import("list_header.zig").Layout) !Report {
    var report: Report = .{};
    var owners: lists.OwnerCursor = .{ .groups = groups };
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        const kind = note.kind(h.id) orelse continue;
        const properties = try note.Properties.parse(h.properties, layout);
        const owned = owners.take(index);
        if (owned.len == 0) return error.MissingNoteList;
        switch (kind) {
            .footnote => report.footnotes += 1,
            .endnote => report.endnotes += 1,
        }
        report.opaque_controls += @intFromBool(properties.observed == null);
        report.header_extra_bytes += properties.extra.len;
        for (owned) |group| {
            const view = try tree.nodes[group.header_node].record.value.list_header.view(list_layout);
            report.lists += 1;
            report.paragraphs += group.paragraph_count;
            report.list_extra_bytes += view.extra.len;
        }
    }
    return report;
}

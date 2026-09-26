const Tree = @import("tree.zig").Tree;
const groups_mod = @import("list_groups.zig");
const note = @import("note_control.zig");
const numbers = @import("number_control.zig");
const rules = @import("control_rules.zig");

pub const Report = struct {
    auto_controls: usize = 0,
    notes_without_auto: usize = 0,
    notes_with_multiple_auto: usize = 0,
    matching_kinds: usize = 0,
    mismatched_kinds: usize = 0,
    matching_stored_numbers: usize = 0,
    mismatched_stored_numbers: usize = 0,
    opaque_stored_numbers: usize = 0,
};

/// Relates direct-list paragraph auto-number controls to their owning note.
/// Record parsing, logical list ownership, and text-token pairing remain with
/// their existing modules. Mismatches are diagnostics, not layout validity.
pub fn inspect(tree: Tree, groups: []const groups_mod.Group, layout: note.Layout) !Report {
    var report: Report = .{};
    var owners: groups_mod.OwnerCursor = .{ .groups = groups };
    for (tree.nodes, 0..) |node, note_index| {
        if (node.record.value != .control_header) continue;
        const header = node.record.value.control_header;
        const kind = note.kind(header.id) orelse continue;
        const properties = try note.Properties.parse(header.properties, layout);
        var note_auto_count: usize = 0;
        for (owners.take(note_index)) |group| {
            if (group.parent_node != note_index or group.begin > group.end or group.end > tree.nodes.len) return error.InvalidNoteGroup;
            var paragraph_index = group.begin;
            while (paragraph_index < group.end) {
                const paragraph = tree.nodes[paragraph_index];
                if (paragraph.subtree_end <= paragraph_index or paragraph.subtree_end > group.end) return error.InvalidNoteGroup;
                if (paragraph.parent == note_index and paragraph.record.value == .header) {
                    var control_index = paragraph_index + 1;
                    while (control_index < paragraph.subtree_end) {
                        const control = tree.nodes[control_index];
                        if (control.subtree_end <= control_index or control.subtree_end > paragraph.subtree_end) return error.InvalidNoteGroup;
                        if (control.parent == paragraph_index and control.record.value == .control_header and control.record.value.control_header.id == rules.id("atno")) {
                            const automatic = try numbers.Auto.parse(control.record.value.control_header.properties);
                            note_auto_count += 1;
                            report.auto_controls += 1;
                            if (automatic.header.kind() == (if (kind == .footnote) @as(u4, 1) else @as(u4, 2))) {
                                report.matching_kinds += 1;
                            } else report.mismatched_kinds += 1;
                            if (properties.observed) |observed| {
                                if (observed.number == automatic.header.number) {
                                    report.matching_stored_numbers += 1;
                                } else report.mismatched_stored_numbers += 1;
                            } else report.opaque_stored_numbers += 1;
                        }
                        control_index = control.subtree_end;
                    }
                }
                paragraph_index = paragraph.subtree_end;
            }
        }
        if (note_auto_count == 0) report.notes_without_auto += 1;
        if (note_auto_count > 1) report.notes_with_multiple_auto += 1;
    }
    return report;
}

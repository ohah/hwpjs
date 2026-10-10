//! Drop only unowned original title sites not covered by a run replacement.
const std = @import("std");
const writer = @import("xml_source_writer.zig");
pub fn append(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, changes: *std.ArrayList(writer.Change)) !void {
    const owned = paragraph.title_positions orelse return;
    const template = tree.elements[paragraph.template_element];
    for (tree.elements, 0..) |marker, index| {
        if (!@import("title_mark_axis.zig").retained(tree, index)) continue;
        const text = marker.parent.?;
        const run = tree.elements[text].parent.?;
        if (tree.elements[run].parent != paragraph.template_element) continue;
        var keep = false;
        for (owned) |position| if (position.element_index == index) {
            keep = true;
            break;
        };
        if (keep) continue;
        const start = marker.start_tag.start - template.start_tag.start;
        const end = marker.end - template.start_tag.start;
        var replaced = false;
        for (changes.items) |change| if (change.start <= start and change.end >= end) {
            replaced = true;
            break;
        };
        if (!replaced) try changes.append(a, .{ .start = start, .end = end, .text = "" });
    }
}

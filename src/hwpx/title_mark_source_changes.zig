//! Drop only unowned original title sites not covered by a run replacement.
const std = @import("std");
const writer = @import("xml_source_writer.zig");
pub fn append(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, changes: *std.ArrayList(writer.Change)) !void {
    const owned = paragraph.title_positions orelse return;
    var nodes = try @import("paragraph_owned_elements.zig").Iterator.init(tree, paragraph.template_element);
    const template = tree.elements[paragraph.template_element];
    var retained: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer retained.deinit(a);
    for (owned) |position| {
        if ((try retained.getOrPut(a, position.element_index)).found_existing) return error.SourceBindingMismatch;
    }
    // Copy numeric spans: appending removals can reallocate changes.items.
    // Borrowing its previous backing array here would create a dangling cursor.
    var covered = try @import("source_change_coverage.zig").Cursor.init(a, changes.items);
    defer covered.deinit(a);
    while (try nodes.next()) |index| {
        const marker = tree.elements[index];
        if (!@import("title_mark_axis.zig").retained(tree, index)) continue;
        const text = marker.parent.?;
        const run = tree.elements[text].parent.?;
        if (tree.elements[run].parent != paragraph.template_element) continue;
        if (retained.contains(index)) continue;
        const start = marker.start_tag.start - template.start_tag.start;
        const end = marker.end - template.start_tag.start;
        if (!try covered.covers(start, end)) try changes.append(a, .{ .start = start, .end = end, .text = "" });
    }
}

//! Read-only declaration coordinates reuse existing field ownership validation.
const std = @import("std");
const Segment = @import("paragraph_text_positions.zig").Segment;

pub fn build(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section_index: usize, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, ordinal: usize) ![]Segment {
    const section = &session.sections[section_index];
    // All temporary field-analysis allocations belong to this query, not the
    // editor allocator. The proxy borrows authoritative sections without edits.
    var query = session.*;
    query.allocator = a;
    const index = std.math.add(usize, section.first_paragraph, ordinal) catch return error.LimitExceeded;
    if (paragraph.field_positions != null) {
        const labels = try query.fieldLabels(section_index, index);
        defer a.free(labels);
        if (labels.len == 0) return error.UnsupportedParagraphControl;
        return @import("field_owned_positions.zig").build(a, &section.tree, paragraph);
    }
    return @import("paragraph_protected_positions.zig").build(a, &section.tree, paragraph) catch |err| {
        if (err != error.UnsupportedParagraphControl) return err;
        const labels = try query.fieldLabels(section_index, index);
        defer a.free(labels);
        if (labels.len == 0) return err;
        const prepared = try @import("field_label_session.zig").prepare(&query, section_index, index, labels[0].begin_element);
        defer prepared.deinit(a);
        return a.dupe(Segment, prepared.segments);
    };
}

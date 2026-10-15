//! Current paragraph spelling shares the field command's segment ownership.
const std = @import("std");

pub fn read(session: anytype, section_index: usize, paragraph: usize) ![]u8 {
    const a = session.allocator;
    const labels = try session.fieldLabels(section_index, paragraph);
    defer a.free(labels);
    if (labels.len == 0) return error.UnsupportedFieldLabelDisplay;
    const part = &session.sections[section_index];
    if (part.structure_values) |*values| {
        if (part.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        const index = paragraph - part.first_paragraph;
        if (index >= values.paragraphs.len) return error.InvalidParagraphIndex;
        const row = &values.paragraphs[index];
        if (row.field_positions != null) {
            const positions = if (row.protected_positions != null and row.pieces == null)
                try @import("paragraph_protected_positions.zig").build(a, &part.tree, row)
            else
                try @import("field_owned_positions.zig").build(a, &part.tree, row);
            defer a.free(positions);
            return spelling(a, &row.sites, positions, session.options.max_text_bytes);
        }
    }
    const prepared = try @import("field_label_session.zig").prepare(session, section_index, paragraph, labels[0].begin_element);
    defer prepared.deinit(a);
    return spelling(a, prepared.sites, prepared.segments, session.options.max_text_bytes);
}

fn spelling(a: std.mem.Allocator, sites: *const @import("text_sites.zig").Sites, positions: []const @import("paragraph_text_positions.zig").Segment, limit: usize) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (positions) |position| {
        const value = @import("paragraph_text_positions.zig").segmentText(sites, position);
        if (value.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, value);
    }
    return output.toOwnedSlice(a);
}

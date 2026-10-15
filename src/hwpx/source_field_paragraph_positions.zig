//! Local field text permission with preserved object widths, not whole-field XML.
pub fn build(session: anytype, section: usize, paragraph: usize) ![]@import("paragraph_text_positions.zig").Segment {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const selected = &session.sections[section];
    if (selected.structure_values != null) return error.UnsupportedStructuralFieldEdit;
    const source_paragraph = try selected.sourceParagraph(paragraph);
    @import("plain_paragraph_policy.zig").validateForFieldText(&selected.tree, &selected.sites, selected.locations, source_paragraph) catch |err| switch (err) {
        error.UnsupportedParagraphControl => return error.UnsupportedFieldLabelContent,
        else => return err,
    };
    return @import("anchor_text_positions.zig").buildForFieldText(session.allocator, &selected.tree, &selected.sites, selected.locations, source_paragraph);
}

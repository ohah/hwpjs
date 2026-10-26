//! Range permission in a validated marker-owned calculated-field paragraph.
const editor = @import("editor_session.zig");

pub fn allowed(session: *const editor.Session, section: usize, paragraph: usize, unit: u32) !?bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const selected = &session.sections[section];
    const values = if (selected.structure_values) |*current| current else return null;
    if (paragraph < selected.first_paragraph or paragraph - selected.first_paragraph >= values.paragraphs.len) return error.InvalidParagraphIndex;
    const index = paragraph - selected.first_paragraph;
    const row = &values.paragraphs[index];
    const owned = row.field_positions orelse return null;
    if (row.pieces != null or row.protected_positions != null or row.column_boundaries != null or row.page_area_positions != null) return null;
    const a = session.allocator;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |part, *tree| tree.* = part.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    if (!@import("formula_marker_kind.zig").owned(&report, section, owned)) return null;
    const spans = try @import("field_current_spans.zig").buildWholeFormula(a, trees, section, values, &report, session.options.max_sites);
    defer a.free(spans);
    const source = try @import("formula_anchor_coordinates.zig").convert(a, session, section, paragraph, unit, .source);
    try @import("field_outside_range.zig").validate(spans, index, source, 0);
    const segments = try @import("field_owned_positions.zig").build(a, &selected.tree, row);
    defer a.free(segments);
    try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, segments, source);
    return true;
}

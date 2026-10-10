//! Range-specific eligibility; never grants whole-paragraph plain editing.
pub fn canEdit(self: *const @import("editor_session.zig").Session, section_index: usize, paragraph: usize, start: u32, end: u32) !bool {
    if (end < start) return error.InvalidTextPosition;
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const section = &self.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    if (section.structure_values == null) {
        const plan = (@import("field_source_outside_plan.zig").prepare(self, section_index, paragraph, start, end) catch |err| switch (err) {
            error.ProtectedFieldRange, error.UnsupportedInlineControl, error.UnsupportedParagraphControl => return false,
            else => return err,
        });
        if (plan) |value| {
            value.deinit(self.allocator);
            return true;
        }
    }
    const current = &(section.structure_values orelse return false);
    const has_formula = try @import("formula_section_save.zig").hasFormula(self.allocator, &section.tree);
    if (has_formula) {
        const plan = (@import("structural_formula_exterior.zig").prepare(self, section_index, paragraph, start, end) catch |err| switch (err) {
            error.ProtectedFieldRange, error.UnsupportedInlineControl, error.UnsupportedParagraphControl => return false,
            else => return err,
        });
        if (plan) |value| {
            value.deinit(self.allocator);
            return true;
        }
    }
    const index = paragraph - section.first_paragraph;
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const row = &current.paragraphs[index];
    if (row.field_positions == null or row.protected_positions != null or row.column_boundaries != null) return false;
    if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    const a = self.allocator;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |part, *tree| tree.* = part.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const spans = @import("field_current_spans.zig").buildForExterior(a, trees, section_index, current, index, &report, 200000) catch |err| switch (err) {
        error.UnsupportedStructuralFieldEdit => return false,
        else => return err,
    };
    defer a.free(spans);
    for (spans) |span| if (has_formula and span.paragraph_index == index) {
        const marker = for (report.markers) |entry| {
            if (entry.kind == .begin and entry.section_ordinal == section_index and entry.element_index == span.begin_element) break entry;
        } else return error.InvalidFieldLinks;
        if (!@import("field_text_kind.zig").supported(marker.begin.?.type_raw orelse return false)) return false;
    };
    @import("field_outside_range.zig").validate(spans, index, start, end - start) catch |err| switch (err) {
        error.ProtectedFieldRange => return false,
        else => return err,
    };
    const positions = @import("field_owned_positions.zig");
    const segments = try positions.build(a, &section.tree, row);
    defer a.free(segments);
    for (segments) |segment| if (segment.kind != .text) return false;
    const text = @import("paragraph_text_positions.zig");
    try text.validateRange(segments, start, end);
    try text.validateBoundary(&row.sites, segments, start);
    try text.validateBoundary(&row.sites, segments, end);
    return true;
}

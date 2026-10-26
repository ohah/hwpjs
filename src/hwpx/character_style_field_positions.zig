//! Retain zero-width source field ownership when formatting materializes text.
pub fn retain(session: *const @import("editor_session.zig").Session, section: usize, values: *@import("paragraph_structure_values.zig").Values) !void {
    if (!try @import("source_field_analysis.zig").hasFields(session, section)) return;
    if (try @import("formula_section_save.zig").hasFormula(session.allocator, &session.sections[section].tree)) return;
    const a = session.allocator;
    var source = try @import("source_field_analysis.zig").lease(session);
    defer source.deinit(a);
    const tree = &session.sections[section].tree;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |part, *input| input.* = part.tree;
    for (values.paragraphs) |*paragraph| {
        if (paragraph.field_positions != null or paragraph.protected_positions != null or paragraph.pieces != null or paragraph.generated_id != null) continue;
        var contains_marker = false;
        var supported = true;
        for (source.source.report.markers) |marker| {
            if (marker.section_ordinal != section or try @import("paragraph_site_owner.zig").ancestor(tree, marker.element_index) != paragraph.template_element) continue;
            contains_marker = true;
            const begin = if (marker.kind == .begin) marker else source.source.report.markers[marker.matched_marker_index orelse return error.InvalidFieldLinks];
            const kind = begin.begin.?.type_raw orelse "";
            if (!@import("field_text_kind.zig").supported(kind) or begin.unexpected_children != 0 or begin.sub_list_children != 0) supported = false;
        }
        if (!contains_marker or !supported) continue;
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
        defer a.free(locations);
        @import("plain_paragraph_policy.zig").validateForCharacterFormat(tree, &paragraph.sites, locations, 1) catch |err| switch (err) {
            error.UnsupportedParagraphControl, error.UnsupportedInlineControl => continue,
            else => return err,
        };
        paragraph.field_positions = try @import("field_source_positions.zig").build(a, trees, section, paragraph, &source.source.report, session.options.max_sites);
    }
}

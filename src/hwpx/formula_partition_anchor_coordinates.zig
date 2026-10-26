//! Paragraph-local result widths for an installed whole-field partition.
const std = @import("std");
const editor = @import("editor_session.zig");

pub fn convert(a: std.mem.Allocator, session: *const editor.Session, section: usize, paragraph: usize, unit: u32, direction: @import("formula_anchor_coordinates.zig").Direction) !u32 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const selected = &session.sections[section];
    const values = &(selected.structure_values orelse return error.SourceBindingMismatch);
    if (paragraph < selected.first_paragraph or paragraph - selected.first_paragraph >= values.paragraphs.len) return error.InvalidParagraphIndex;
    const row = &values.paragraphs[paragraph - selected.first_paragraph];
    if (row.field_positions == null or row.pieces != null) return error.UnsupportedStructuralFieldEdit;
    var flat = try @import("structural_source_view.zig").open(a, session, section);
    defer flat.deinit();
    var current = try @import("formula_current_snapshot.zig").readFlat(a, &flat.session, section);
    defer current.deinit(a);
    const descriptors = try a.dupe(@import("text_sites.zig").Site, row.sites.items);
    defer a.free(descriptors);
    for (current.prepared) |field| for (field.result.items) |replacement| {
        if (replacement.site_index >= flat.sites.items.len) return error.InvalidTextSites;
        const source = flat.sites.items[replacement.site_index];
        var found = false;
        for (descriptors) |*site| {
            if (site.element_index != source.element_index or site.start != source.start or site.end != source.end) continue;
            if (found or !std.mem.eql(u8, site.text, source.text)) return error.SourceBindingMismatch;
            found = true;
            site.text = replacement.text;
        }
    };
    const original = try @import("field_owned_positions.zig").build(a, &selected.tree, row);
    defer a.free(original);
    var displayed_row = row.*;
    displayed_row.sites.items = descriptors;
    const displayed = try @import("field_owned_positions.zig").build(a, &selected.tree, &displayed_row);
    defer a.free(displayed);
    const mapper = @import("text_site_boundary_map.zig");
    const from = if (direction == .source) displayed else original;
    const to = if (direction == .source) original else displayed;
    return mapper.resolve(to, try mapper.capture(from, to, unit, .after));
}

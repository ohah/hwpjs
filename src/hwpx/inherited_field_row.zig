//! Inherited CLICK_HERE/table ownership without global policy relaxation.
//! Called only after strict validateLinkedMode returned UnsupportedFieldLabelContent.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Range = @import("field_text_ranges.zig").Range;
const fields = @import("field_markers.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub fn validate(session: anytype, section: usize, paragraph: usize, selected: Range, report: *const fields.Report, ranges: []const Range, frames: []const @import("xml_tree_selection.zig").Frame) !?usize {
    const a = session.allocator;
    const part = &session.sections[section];
    const current = if (part.structure_values) |*v| v else return null;
    if (selected.begin_marker >= report.markers.len or selected.end_marker >= report.markers.len) return error.InvalidFieldLinks;
    const begin = report.markers[selected.begin_marker];
    if (begin.kind != .begin) return error.SourceBindingMismatch;
    const begin_properties = begin.begin orelse return error.SourceBindingMismatch;
    if (!std.mem.eql(u8, begin_properties.type_raw orelse "", "CLICK_HERE")) return null;
    const rejected = (try @import("field_label_content_policy.zig").firstUnsupportedNode(&part.tree, selected, ranges, report, false)) orelse return null;
    if (!part.tree.elements[rejected].is(uri, "tbl")) return null;
    const owner = try @import("inherited_field_identity.zig").validate(session, section, paragraph, report, ranges, frames);
    const row = &current.paragraphs[paragraph - part.first_paragraph];
    const node = part.tree.elements[owner];
    if (node.end <= selected.content_start or node.start_tag.start >= selected.content_end) return null;
    if (row.column_boundaries != null or row.character_styles != null) return error.UnsupportedStructuralFieldEdit;
    // The local row may be an intermediate paragraph of a matched field.
    // Source/current topology equality above proves inherited marker ownership.
    const locations = try @import("paragraph_structure_locations.zig").build(a, &part.tree, row);
    defer a.free(locations);
    try @import("plain_paragraph_policy.zig").validateForFieldText(&part.tree, &row.sites, locations, 1);
    const positions = try @import("anchor_text_positions.zig").buildForFieldText(a, &part.tree, &row.sites, locations, 1);
    defer a.free(positions);
    for (positions) |position| if (position.kind == .anchor) {
        if (!part.tree.elements[position.index].is(uri, "tbl") or position.source_start < selected.content_start or position.source_start >= selected.content_end) return null;
    };
    // Tableless continuations share the same proven inherited field ownership.
    _ = @import("field_text_positions.zig").project(selected, section, positions) orelse return null;
    return row.template_element;
}

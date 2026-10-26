//! Save owned text and column coordinates from one unchanged source paragraph.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const sites_mod = @import("text_sites.zig");

/// Flat text patches are sufficient when source controls already have current coordinates.
pub fn requiresRelocation(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !bool {
    const owned = paragraph.column_boundaries orelse return false;
    try @import("column_boundary_partition.zig").validate(a, tree, &.{paragraph.*});
    if (paragraph.column_structure_changed) return true;
    const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(positions);
    const actual = try @import("column_boundary_collect.zig").collect(a, tree, paragraph.template_element, positions, .right, owned.len);
    defer a.free(actual);
    if (actual.len != owned.len) return error.SourceBindingMismatch;
    for (actual, owned) |before, current| {
        if (before.source_element != current.source_element) return error.SourceBindingMismatch;
        if (before.unit != current.unit) return true;
    }
    return false;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: sites_mod.Options, limit: usize) ![]u8 {
    const boundaries = paragraph.column_boundaries orelse return error.MissingColumnBoundaries;
    if (paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.pieces != null or paragraph.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    try @import("column_boundary_partition.zig").validate(a, tree, &.{paragraph.*});
    var base_paragraph = paragraph.*;
    base_paragraph.column_boundaries = null;
    const base = if (paragraph.character_styles != null)
        try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, tree, &base_paragraph, &.{}, options, limit)
    else if (paragraph.column_structure_changed)
        try @import("paragraph_split_xml.zig").writeColumnStructure(a, tree, paragraph.template_element, &paragraph.sites, options, limit)
    else
        try @import("paragraph_split_xml.zig").writeOriginalAnchored(a, tree, paragraph.template_element, &paragraph.sites, options, limit);
    defer a.free(base);
    const node = tree.elements[paragraph.template_element];
    const temporary_limit = std.math.add(usize, tree.source.len, limit) catch return error.LimitExceeded;
    const serialized = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = base }}, temporary_limit);
    defer a.free(serialized);
    var rendered = try @import("xml_part_tree.zig").parse(a, serialized, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
    defer rendered.deinit(a);
    // Only descendants changed, so the source paragraph element index remains.
    const owner = paragraph.template_element;
    const original = try @import("column_boundary_collect.zig").collect(a, tree, owner, &.{}, .right, tree.elements.len);
    defer a.free(original);
    const current = try @import("column_boundary_collect.zig").collect(a, &rendered, owner, &.{}, .right, rendered.elements.len);
    defer a.free(current);
    if (original.len != current.len or original.len != boundaries.len) return error.SourceBindingMismatch;
    var mapping: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer mapping.deinit(a);
    for (original, current) |before, after| {
        if (!std.mem.eql(u8, tree.sourceOf(before.source_element), rendered.sourceOf(after.source_element))) return error.SourceBindingMismatch;
        try mapping.put(a, before.source_element, after.source_element);
    }
    const moves = try a.dupe(@import("column_boundary_position.zig").Position, boundaries);
    defer a.free(moves);
    for (moves) |*boundary| boundary.source_element = mapping.get(boundary.source_element) orelse return error.SourceBindingMismatch;
    var sites = try sites_mod.collect(a, &rendered, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &rendered, &sites, options);
    defer a.free(locations);
    var ordinal: ?usize = null;
    for (sites.items, locations) |site, location| {
        const element = rendered.elements[site.element_index];
        const run = if (site.missing_text) site.element_index else element.parent orelse continue;
        if (rendered.elements[run].parent == owner) {
            ordinal = location.paragraph_ordinal;
            break;
        }
    }
    const selected_ordinal = ordinal orelse return error.MissingTextSite;
    const positions = try @import("anchor_text_positions.zig").build(a, &rendered, &sites, locations, selected_ordinal);
    defer a.free(positions);
    const actual = try @import("column_boundary_collect.zig").collect(a, &rendered, owner, positions, .right, moves.len);
    defer a.free(actual);
    var units: std.AutoHashMapUnmanaged(usize, u32) = .empty;
    defer units.deinit(a);
    for (actual) |boundary| try units.put(a, boundary.source_element, boundary.unit);
    var moved_count: usize = 0;
    for (moves) |boundary| {
        if ((units.get(boundary.source_element) orelse return error.SourceBindingMismatch) == boundary.unit) continue;
        moves[moved_count] = boundary;
        moved_count += 1;
    }
    const moved = try @import("column_boundary_moves_xml.zig").write(a, &rendered, &sites, locations, selected_ordinal, moves[0..moved_count], temporary_limit);
    defer a.free(moved);
    var result = try @import("xml_part_tree.zig").parse(a, moved, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
    defer result.deinit(a);
    const output = result.sourceOf(owner);
    if (output.len > limit) return error.LimitExceeded;
    return a.dupe(u8, output);
}

//! Borrow current Sites; rebuild provenance, never cache serialized XML.
const std = @import("std");
pub fn writeRun(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, current: []const @import("character_style_paint.zig").Span, run_index: usize, limit: usize) ![]u8 {
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    const positions = if (paragraph.protected_positions != null) try @import("paragraph_protected_positions.zig").build(a, tree, paragraph) else try @import("anchor_paragraph_edit.zig").segments(a, tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    const typed = @import("character_style_anchor_projection.zig");
    const original = try typed.build(a, tree, &paragraph.sites, positions, 1_000_000);
    defer a.free(original);
    const owned = try @import("character_style_anchor_adapter.zig").fromTyped(a, tree, &paragraph.sites, original);
    defer a.free(owned);
    var selected: std.ArrayList(typed.Span) = .empty;
    defer selected.deinit(a);
    for (original, owned) |span, source| if (source.run_element == run_index) {
        try selected.append(a, span);
    };
    const candidate = try @import("character_style_anchor_adapter.zig").toTyped(a, current);
    defer a.free(candidate);
    return @import("character_style_anchor_run.zig").writeTitles(a, tree, &paragraph.sites, run_index, selected.items, candidate, limit, paragraph.protected_positions, paragraph.title_positions);
}

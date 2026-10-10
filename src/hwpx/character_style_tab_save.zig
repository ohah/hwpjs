//! Save adapter from the sole owned style model to a typed run assembler.
const std = @import("std");
pub fn writeRun(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, current: []const @import("character_style_paint.zig").Span, run_index: usize, limit: usize) ![]u8 {
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    const typed = @import("character_style_tab_projection.zig");
    const original = try typed.build(a, tree, &paragraph.sites, positions, 1_000_000);
    defer a.free(original);
    const owned = try @import("character_style_tab_adapter.zig").fromTyped(a, tree, &paragraph.sites, original);
    defer a.free(owned);
    var selected: std.ArrayList(typed.Span) = .empty;
    defer selected.deinit(a);
    for (original, owned) |span, source| if (source.run_element == run_index) {
        try selected.append(a, span);
    };
    const candidate = try @import("character_style_tab_adapter.zig").toTyped(a, current);
    defer a.free(candidate);
    return @import("character_style_tab_run.zig").writeTitles(a, tree, &paragraph.sites, run_index, selected.items, candidate, limit, paragraph.title_positions);
}

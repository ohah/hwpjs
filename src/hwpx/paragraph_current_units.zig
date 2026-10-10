//! Current UTF-16 length through the shared plain/joined position adapters.
const std = @import("std");

pub fn read(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph) !u32 {
    const positions = if (paragraph.joined()) |joined|
        try @import("paragraph_joined_positions.zig").build(a, tree, &joined)
    else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
        defer a.free(locations);
        break :block try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    };
    defer a.free(positions);
    return std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse error.LimitExceeded;
}

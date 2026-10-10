//! Current owned title positions, otherwise derive once from source/text axis.
const std = @import("std");
const Position = @import("title_mark_position.zig").Position;
pub fn read(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph) ![]Position {
    if (paragraph.title_positions) |items| return a.dupe(Position, items);
    var found = false;
    for (tree.elements, 0..) |element, index| {
        if (!@import("title_mark_axis.zig").retained(tree, index)) continue;
        const text = element.parent.?;
        const run = tree.elements[text].parent.?;
        if (tree.elements[run].parent == paragraph.template_element) found = true;
    }
    if (!found) return a.alloc(Position, 0);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    var axis = try @import("title_mark_axis.zig").build(a, tree, &paragraph.sites, locations, 1);
    defer axis.deinit(a);
    var result: std.ArrayList(Position) = .empty;
    defer result.deinit(a);
    for (axis.marks) |mark| if (mark.kind == .title_mark) {
        try result.append(a, .{ .element_index = mark.element, .unit = mark.display_unit });
    };
    return result.toOwnedSlice(a);
}

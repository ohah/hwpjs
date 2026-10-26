//! Original equation frame only; script edits do not refresh its dimensions.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const shape = @import("equation_shape.zig");
const children = @import("shape_xml_children.zig");
pub const Size = struct {
    node: usize,
    width: ?[]const u8,
    height: ?[]const u8,
    width_relative_to: ?[]const u8,
    height_relative_to: ?[]const u8,
    protect: ?[]const u8,
    other_attributes: usize,
    direct_children: usize,
};

pub fn read(temp: std.mem.Allocator, owned: std.mem.Allocator, tree: *const Tree, parent: usize, max_attribute_bytes: usize, budget: *@import("equation_fields.zig").Budget) !?Size {
    var found: ?usize = null;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |child| : (cursor = tree.elements[child].next_sibling) {
        if (children.kindOf(tree, child, .common) != .size) continue;
        if (found != null) return error.DuplicateEquationSize;
        found = child;
    }
    const node = found orelse return null;
    var report: shape.Report = .{};
    const value = try shape.read(temp, owned, tree, parent, node, 0, tree.sourceOf(parent), max_attribute_bytes, budget, &report);
    return .{ .node = node, .width = value.get("width"), .height = value.get("height"), .width_relative_to = value.get("widthRelTo"), .height_relative_to = value.get("heightRelTo"), .protect = value.get("protect"), .other_attributes = value.other_attributes, .direct_children = value.direct_children };
}

//! Validate one joined owner's current boundaries without replacing coordinates.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const Position = @import("column_boundary_position.zig").Position;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, owned: []const Position) !void {
    return validateMode(a, tree, joined, owned, false, false);
}

pub fn validateWithTabs(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, owned: []const Position) !void {
    return validateMode(a, tree, joined, owned, true, false);
}

pub fn validateWithAnchors(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, owned: []const Position) !void {
    return validateMode(a, tree, joined, owned, true, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, owned: []const Position, allow_tabs: bool, anchors: bool) !void {
    const inventory = if (anchors) try @import("column_boundary_joined_collect.zig").collectWithAnchors(a, tree, joined, tree.elements.len) else if (allow_tabs) try @import("column_boundary_joined_collect.zig").collectWithTabs(a, tree, joined, tree.elements.len) else try @import("column_boundary_joined_collect.zig").collect(a, tree, joined, tree.elements.len);
    defer a.free(inventory);
    if (inventory.len != owned.len) return error.SourceBindingMismatch;
    const positions = if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, joined) else if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, joined) else try @import("paragraph_joined_positions.zig").build(a, tree, joined);
    defer a.free(positions);
    for (owned, inventory, 0..) |current, source, index| {
        if (current.source_element != source.source_element) return error.SourceBindingMismatch;
        if (index != 0 and current.unit < owned[index - 1].unit) return error.InvalidColumnBoundaryOrder;
        try @import("paragraph_text_positions.zig").validateBoundary(&joined.sites, positions, current.unit);
    }
}

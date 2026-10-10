//! Explicit serialization order for emitted controls followed by inventory-only controls.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const Position = @import("column_boundary_position.zig").Position;
pub const Plan = struct { items: []Position, visible: usize };

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, joined: ?Joined, inventory: []const Position) !Plan {
    const items = try a.alloc(Position, inventory.len);
    errdefer a.free(items);
    var count: usize = 0;
    for (inventory) |boundary| if (!try hidden(tree, joined, boundary)) {
        items[count] = boundary;
        count += 1;
    };
    const visible = count;
    for (inventory) |boundary| if (try hidden(tree, joined, boundary)) {
        items[count] = boundary;
        count += 1;
    };
    return .{ .items = items, .visible = visible };
}

fn hidden(tree: *const Tree, joined: ?Joined, boundary: Position) !bool {
    const view = joined orelse return false;
    const control = try @import("column_boundary_xml.zig").control(tree, boundary.source_element);
    const run = tree.elements[control].parent.?;
    const owner = tree.elements[run].parent.?;
    var role: ?bool = null;
    for (view.pieces) |piece| {
        if (!piece.owns_source or piece.template_element != owner) continue;
        if (role != null) return error.SourceBindingMismatch;
        role = piece.output == .inventory_only;
    }
    return role orelse error.SourceBindingMismatch;
}

test "column inventory order retains identities with hidden middle source" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr/></p:ctrl></p:run></p:p><p:p><p:run><p:ctrl><p:colPr/></p:ctrl></p:run></p:p><p:p><p:run><p:ctrl><p:colPr/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{
        .{ .template_element = 1, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = 0 },
        .{ .template_element = 5, .source_ordinal = 2, .generated_id = null, .first_site = 0, .site_count = 0, .output = .inventory_only },
        .{ .template_element = 9, .source_ordinal = 3, .generated_id = null, .first_site = 0, .site_count = 0 },
    };
    const joined: Joined = .{ .pieces = &pieces, .sites = .{ .items = &.{} } };
    const inventory = [_]Position{
        .{ .source_element = 4, .unit = 0, .affinity = .left },
        .{ .source_element = 8, .unit = 0, .affinity = .left },
        .{ .source_element = 12, .unit = 0, .affinity = .left },
    };
    const plan = try prepare(a, &tree, joined, &inventory);
    defer a.free(plan.items);
    try std.testing.expectEqual(@as(usize, 2), plan.visible);
    const expected = [_]Position{ inventory[0], inventory[2], inventory[1] };
    try std.testing.expectEqualDeep(@as([]const Position, &expected), @as([]const Position, plan.items));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: Joined, boundaries: []const Position) !void {
            const result = try prepare(allocator, parsed, current, boundaries);
            defer allocator.free(result.items);
        }
    }.run, .{ &tree, joined, &inventory });
    pieces[2].template_element = 5;
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &tree, joined, &inventory));
}

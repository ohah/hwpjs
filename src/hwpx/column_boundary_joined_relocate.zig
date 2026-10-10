//! Relocate controls in a transient joined paragraph; original IDs remain provenance.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("column_boundary_position.zig").Position;

pub fn write(a: std.mem.Allocator, source: *const Tree, base: []const u8, boundaries: []const Position, limit: usize) ![]u8 {
    if (source.elements.len == 0) return error.SourceBindingMismatch;
    const root = source.elements[0];
    const root_end = root.end_tag orelse return error.SourceBindingMismatch;
    // The fragment inherits the source section's namespace declarations.
    const wrapper = try std.mem.concat(a, u8, &.{ source.source[root.start_tag.start..root.start_tag.end], base, source.source[root_end.start..root_end.end] });
    defer a.free(wrapper);
    const temporary_limit = std.math.add(usize, wrapper.len, limit) catch return error.LimitExceeded;
    var tree = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = temporary_limit });
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const owner = try @import("paragraph_site_owner.zig").resolve(&tree, &sites, locations, 1);
    const positions = try @import("anchor_text_positions.zig").build(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    const actual = try @import("column_boundary_collect.zig").collect(a, &tree, owner, positions, .right, boundaries.len);
    defer a.free(actual);
    if (actual.len != boundaries.len) return error.SourceBindingMismatch;
    var moves: std.ArrayList(Position) = .empty;
    defer moves.deinit(a);
    for (boundaries, actual) |expected, current| {
        if (expected.source_element >= source.elements.len or !std.mem.eql(u8, source.sourceOf(expected.source_element), tree.sourceOf(current.source_element))) return error.SourceBindingMismatch;
        if (expected.unit == current.unit) continue;
        var move = expected;
        move.source_element = current.source_element;
        try moves.append(a, move);
    }
    const rendered = try @import("column_boundary_moves_xml.zig").write(a, &tree, &sites, locations, 1, moves.items, temporary_limit);
    defer a.free(rendered);
    var result = try @import("xml_part_tree.zig").parse(a, rendered, .section, 0, 0, .{ .max_xml_bytes = temporary_limit });
    defer result.deinit(a);
    const output = result.sourceOf(owner);
    if (output.len > limit) return error.LimitExceeded;
    return a.dupe(u8, output);
}

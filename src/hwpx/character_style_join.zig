//! Concatenate current style partitions, resolving absent partitions from source.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;
const paint = @import("character_style_paint.zig");
pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const Joined, right: *const Joined) !?[]paint.Span {
    return prepareMode(a, tree, left, right, false);
}

pub fn prepareWithFields(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const Joined, right: *const Joined) !?[]paint.Span {
    return prepareMode(a, tree, left, right, true);
}

fn prepareMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const Joined, right: *const Joined, fields: bool) !?[]paint.Span {
    if (left.character_styles == null and right.character_styles == null) return null;
    const one = try partition(a, tree, left, fields);
    defer a.free(one);
    const two = try partition(a, tree, right, fields);
    defer a.free(two);
    const offset = if (one.len == 0) 0 else one[one.len - 1].end_unit;
    var output: std.ArrayList(paint.Span) = .empty;
    defer output.deinit(a);
    for (one) |span| try paint.append(a, &output, span, 1_000_000);
    for (two) |span| {
        var shifted = span;
        shifted.site_index = std.math.add(usize, span.site_index, left.sites.items.len) catch return error.LimitExceeded;
        shifted.start_unit = std.math.add(usize, span.start_unit, offset) catch return error.LimitExceeded;
        shifted.end_unit = std.math.add(usize, span.end_unit, offset) catch return error.LimitExceeded;
        shifted.site_start_unit = std.math.add(usize, span.site_start_unit, offset) catch return error.LimitExceeded;
        try paint.append(a, &output, shifted, 1_000_000);
    }
    return try output.toOwnedSlice(a);
}
fn partition(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, fields: bool) ![]paint.Span {
    if (current.character_styles) |styles| return a.dupe(paint.Span, styles);
    const positions = if (fields) try @import("paragraph_joined_positions.zig").buildWithFields(a, tree, current) else try @import("paragraph_joined_positions.zig").build(a, tree, current);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, tree, &current.sites, positions, 1_000_000);
    defer a.free(projection);
    return paint.fromProjection(a, projection, 1_000_000);
}

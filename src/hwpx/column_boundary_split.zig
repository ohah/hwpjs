//! Split text and column ownership together without changing the source model.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize, anchored: bool) anyerror!model.Values {
    const selected = &current.paragraphs[index];
    const group = try @import("column_boundary_group.zig").locate(current, index);
    for (current.paragraphs[group.start..group.end]) |part| {
        if (part.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    }
    const joined = selected.joined();
    if (joined != null and anchored) return error.UnsupportedAnchoredStructure;
    if (joined != null)
        try @import("column_boundary_joined_group.zig").validate(a, tree, current.paragraphs[group.start..group.end])
    else
        try @import("column_boundary_partition.zig").validate(a, tree, current.paragraphs[group.start..group.end]);
    const positions = if (joined) |view|
        try @import("paragraph_joined_positions.zig").build(a, tree, &view)
    else
        try @import("paragraph_protected_positions.zig").build(a, tree, selected);
    defer a.free(positions);
    try @import("paragraph_text_positions.zig").validateRange(positions, at, end);
    const length = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const source = selected.column_boundaries.?;
    const shortened = try @import("column_boundary_edit.zig").splice(a, source, at, end, 0, length, source.len);
    defer a.free(shortened);
    var parts = try @import("column_boundary_edit.zig").split(a, shortened, at, length - (end - at), source.len);
    var installed = false;
    defer if (!installed) parts.deinit(a);
    // Borrow all current values; detach only the descriptor passed to the text splitter.
    const descriptors = try a.dupe(model.Paragraph, current.paragraphs);
    defer a.free(descriptors);
    descriptors[index].column_boundaries = null;
    const text_current: model.Values = .{ .paragraphs = descriptors };
    const has_protected_units = block: {
        for (positions) |position| if (position.kind != .text) break :block true;
        break :block false;
    };
    var result = if (anchored and has_protected_units)
        try @import("paragraph_structure_split.zig").prepareAnchored(a, tree, &text_current, index, at, end, id, limit)
    else
        try @import("paragraph_structure_split.zig").prepare(a, tree, &text_current, index, at, end, id, limit);
    errdefer result.deinit(a);
    result.paragraphs[index].column_boundaries = parts.left;
    result.paragraphs[index + 1].column_boundaries = parts.right;
    result.paragraphs[index].column_structure_changed = selected.column_structure_changed;
    result.paragraphs[index + 1].column_structure_changed = selected.column_structure_changed;
    installed = true;
    if (joined != null)
        try @import("column_boundary_joined_group.zig").validate(a, tree, result.paragraphs[group.start .. group.end + 1])
    else
        try @import("column_boundary_partition.zig").validate(a, tree, result.paragraphs[group.start .. group.end + 1]);
    _ = try result.byteSize(limit);
    return result;
}

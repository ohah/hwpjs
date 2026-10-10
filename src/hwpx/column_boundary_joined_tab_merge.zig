//! 같은 다단/탭 그룹의 인접 문단을 기존 소유 모델에서 재병합합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize) !model.Values {
    if (index >= current.paragraphs.len or current.paragraphs.len - index < 2) return error.InvalidParagraphIndex;
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[index + 1];
    if (left.template_element != right.template_element) return error.SourceBindingMismatch;
    const group = try @import("column_boundary_group.zig").locate(current, index);
    const anchors = @import("paragraph_joined_anchor_mode.zig").has(tree, &left.joined().?);
    if (index + 1 >= group.end) return error.SourceBindingMismatch;
    if (anchors) try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, current.paragraphs[group.start..group.end]) else try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, current.paragraphs[group.start..group.end]);
    const left_positions = try @import("paragraph_protected_positions.zig").build(a, tree, left);
    defer a.free(left_positions);
    const right_positions = try @import("paragraph_protected_positions.zig").build(a, tree, right);
    defer a.free(right_positions);
    const left_units = std.math.cast(u32, if (left_positions.len == 0) 0 else left_positions[left_positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const right_units = std.math.cast(u32, if (right_positions.len == 0) 0 else right_positions[right_positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const boundaries = try @import("column_boundary_edit.zig").merge(a, left.column_boundaries.?, right.column_boundaries.?, left_units, right_units, tree.elements.len);
    var installed = false;
    errdefer if (!installed) a.free(boundaries);
    var merged = try @import("paragraph_protected_merge.zig").prepare(a, tree, left, right, limit);
    defer merged.deinit(a);
    a.free(merged.column_boundaries.?);
    merged.column_boundaries = boundaries;
    installed = true;
    merged.column_structure_changed = left.column_structure_changed or right.column_structure_changed;
    const paragraphs = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (paragraphs[0..initialized]) |*paragraph| paragraph.deinit(a);
        a.free(paragraphs);
    }
    for (current.paragraphs, 0..) |*paragraph, ordinal| {
        if (ordinal == index + 1) continue;
        paragraphs[initialized] = try (if (ordinal == index) &merged else paragraph).clone(a);
        initialized += 1;
    }
    const result: model.Values = .{ .paragraphs = paragraphs };
    if (anchors) try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, result.paragraphs[group.start .. group.end - 1]) else try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, result.paragraphs[group.start .. group.end - 1]);
    _ = try result.byteSize(limit);
    return result;
}

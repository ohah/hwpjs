//! 같은 원본의 분할 문단을 출처와 선언 좌표를 유지하며 병합합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, left_index: usize, right_index: usize, limit: usize) !model.Values {
    if (left_index >= right_index or right_index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const left = &current.paragraphs[left_index];
    const right = &current.paragraphs[right_index];
    if (left.template_element != right.template_element or right.generated_id == null) return error.UnsupportedPageAreaOwnership;
    if (try @import("paragraph_current_neighbor.zig").next(tree, current, left_index) != right_index) return error.InvalidParagraphAdjacency;
    for ([_]*const model.Paragraph{ left, right }) |row| {
        if (row.protected_positions != null or row.field_positions != null or row.column_boundaries != null or row.character_styles != null) return error.UnsupportedPageAreaOwnership;
        try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, row);
    }
    const left_segments = try @import("paragraph_protected_positions.zig").build(a, tree, left);
    defer a.free(left_segments);
    const right_segments = try @import("paragraph_protected_positions.zig").build(a, tree, right);
    defer a.free(right_segments);
    for (left_segments) |segment| if (segment.kind != .text) return error.UnsupportedPageAreaOwnership;
    for (right_segments) |segment| if (segment.kind != .text) return error.UnsupportedPageAreaOwnership;
    const left_length = std.math.cast(u32, if (left_segments.len == 0) 0 else left_segments[left_segments.len - 1].end_unit) orelse return error.LimitExceeded;
    const right_length = std.math.cast(u32, if (right_segments.len == 0) 0 else right_segments[right_segments.len - 1].end_unit) orelse return error.LimitExceeded;
    const areas = try @import("page_area_edit.zig").merge(a, left.page_area_positions orelse &.{}, right.page_area_positions orelse &.{}, left_length, right_length, tree.elements.len);
    var transferred = false;
    defer if (!transferred) a.free(areas);
    var left_view = left.*;
    left_view.page_area_positions = null;
    var right_view = right.*;
    right_view.page_area_positions = null;
    var first = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &left_view);
    defer first.deinit(a);
    var second = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &right_view);
    defer second.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepare(a, tree, &first, &second, limit);
    defer joined.deinit(a);
    if (joined.character_styles != null) return error.UnsupportedPageAreaMergeBinding;
    var merged = try left.clone(a);
    defer merged.deinit(a);
    const pieces = if (joined.pieces.len != 1) try a.dupe(@import("paragraph_joined_values.zig").Piece, joined.pieces) else null;
    if (merged.pieces) |previous| a.free(previous);
    merged.pieces = pieces;
    const sites = try joined.sites.clone(a);
    merged.sites.deinit(a);
    merged.sites = sites;
    if (merged.page_area_positions) |owned| a.free(owned);
    merged.page_area_positions = areas;
    transferred = true;
    const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*row, index| {
        if (index == right_index) continue;
        rows[initialized] = try (if (index == left_index) &merged else row).clone(a);
        initialized += 1;
    }
    const output: model.Values = .{ .paragraphs = rows };
    _ = try output.byteSize(limit);
    return output;
}

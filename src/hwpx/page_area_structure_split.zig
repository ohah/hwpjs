//! 양쪽 쪽 영역 귀속과 기존 문단 분할 후보를 함께 조립합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) anyerror!model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const selected = &current.paragraphs[index];
    if (selected.column_boundaries != null and selected.pieces != null) return @import("column_page_area_structure_split.zig").prepare(a, tree, current, index, at, end, id, limit);
    const areas = selected.page_area_positions orelse return error.MissingPageAreaPositions;
    try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, selected);
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, selected);
    defer a.free(segments);
    for (segments) |segment| if (segment.kind != .text) return error.UnsupportedPageAreaSplitPartition;
    try @import("paragraph_text_positions.zig").validateBoundary(&selected.sites, segments, at);
    try @import("paragraph_text_positions.zig").validateBoundary(&selected.sites, segments, end);
    if (end < at) return error.InvalidTextPosition;
    const length = std.math.cast(u32, if (segments.len == 0) 0 else segments[segments.len - 1].end_unit) orelse return error.LimitExceeded;
    var parts = try @import("page_area_edit.zig").split(a, areas, at, end, length, areas.len);
    defer parts.deinit(a);
    var detached = try current.clone(a);
    defer detached.deinit(a);
    a.free(detached.paragraphs[index].page_area_positions.?);
    detached.paragraphs[index].page_area_positions = null;
    var output = try @import("paragraph_structure_split.zig").prepare(a, tree, &detached, index, at, end, id, limit);
    errdefer output.deinit(a);
    const left = try a.dupe(@import("page_area_position.zig").Position, parts.left);
    output.paragraphs[index].page_area_positions = left;
    var distributed = parts.right.len != 0 or selected.generated_id != null or selected.pieces != null;
    for (current.paragraphs, 0..) |row, ordinal| {
        if (ordinal != index and row.template_element == selected.template_element and row.page_area_positions != null) distributed = true;
    }
    if (distributed) {
        var continuation: ?usize = null;
        for (output.paragraphs, 0..) |row, ordinal| {
            if (row.generated_id == id and row.template_element == selected.template_element) continuation = ordinal;
        }
        const right_index = continuation orelse return error.SourceBindingMismatch;
        output.paragraphs[right_index].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, parts.right);
        for (output.paragraphs) |*row| {
            if (row.template_element == selected.template_element and row.page_area_positions == null) row.page_area_positions = try a.alloc(@import("page_area_position.zig").Position, 0);
        }
        try @import("paragraph_page_area_order.zig").repartitionSplit(a, tree, output.paragraphs, index, right_index);
    }
    _ = try output.byteSize(limit);
    return output;
}

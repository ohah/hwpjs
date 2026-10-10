//! 현재 필드 그룹의 문단을 다시 나누되 다른 문단의 마커 소유를 유지합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, report: *const @import("field_markers.zig").Report, limit: usize, max_markers: usize) !model.Values {
    return prepareMode(a, trees, section, current, index, start, end, id, report, limit, max_markers, false);
}

pub fn prepareWholeFormula(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, report: *const @import("field_markers.zig").Report, limit: usize, max_markers: usize) !model.Values {
    return prepareMode(a, trees, section, current, index, start, end, id, report, limit, max_markers, true);
}

fn prepareMode(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, report: *const @import("field_markers.zig").Report, limit: usize, max_markers: usize, whole_formula: bool) !model.Values {
    const row = &current.paragraphs[index];
    const owned = row.field_positions orelse return error.UnsupportedStructuralFieldEdit;
    if (id == 0) return error.InvalidParagraphId;
    if (row.pieces != null or row.protected_positions != null or row.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    for (current.paragraphs) |paragraph| if (paragraph.generated_id) |existing| try ids.append(a, existing);
    try ids.append(a, id);
    _ = try @import("paragraph_instance_ids.zig").next(a, trees, ids.items, std.math.maxInt(usize));
    const before = if (whole_formula) try @import("field_current_spans.zig").buildWholeFormula(a, trees, section, current, report, max_markers) else try @import("field_current_spans.zig").buildForExterior(a, trees, section, current, index, report, max_markers);
    defer a.free(before);
    const locations = try @import("paragraph_structure_locations.zig").build(a, &trees[section], row);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &trees[section], &row.sites, locations, 1);
    defer a.free(positions);
    for (positions) |position| if (position.kind != .text) return error.UnsupportedInlineControl;
    try @import("paragraph_text_positions.zig").validateRange(positions, start, end);
    try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, positions, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, positions, end);
    var draft = try @import("paragraph_split_text.zig").fromPositions(a, &row.sites, positions, row.template_element, start, end, limit);
    defer draft.deinit(a);
    const moves = try @import("field_split_plan.zig").build(a, owned, start, end, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit, max_markers);
    defer a.free(moves);
    if (whole_formula) try @import("formula_field_split_guard.zig").validateRange(a, report, section, moves, start, end);
    const count = std.math.add(usize, current.paragraphs.len, 1) catch return error.LimitExceeded;
    if (count > limit / @sizeOf(model.Paragraph)) return error.LimitExceeded;
    const rows = try a.alloc(model.Paragraph, count);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*paragraph| paragraph.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*paragraph, ordinal| {
        rows[initialized] = try paragraph.clone(a);
        initialized += 1;
        if (ordinal != index) continue;
        const left = &rows[initialized - 1];
        const left_sites = try draft.left.clone(a);
        left.sites.deinit(a);
        left.sites = left_sites;
        a.free(left.field_positions.?);
        left.field_positions = null;
        left.field_positions = try @import("field_structure_split.zig").side(a, moves, .left);
        if (row.character_styles) |styles| {
            const clipped = try @import("character_style_split.zig").side(a, styles, &row.sites, &left.sites, start, false, limit / @sizeOf(@import("character_style_paint.zig").Span));
            a.free(left.character_styles.?);
            left.character_styles = clipped;
        }
        rows[initialized] = .{ .template_element = row.template_element, .source_ordinal = null, .generated_id = id, .paragraph_shape_id = row.paragraph_shape_id, .column_structure_changed = row.column_structure_changed, .sites = try draft.right.clone(a) };
        initialized += 1;
        rows[initialized - 1].field_positions = try @import("field_structure_split.zig").side(a, moves, .right);
        if (row.character_styles) |styles| rows[initialized - 1].character_styles = try @import("character_style_split.zig").side(a, styles, &row.sites, &rows[initialized - 1].sites, end, true, limit / @sizeOf(@import("character_style_paint.zig").Span));
    }
    const result: model.Values = .{ .paragraphs = rows };
    const after = if (whole_formula) try @import("field_current_spans.zig").buildWholeFormula(a, trees, section, &result, report, max_markers) else try @import("field_current_spans.zig").buildForExterior(a, trees, section, &result, index, report, max_markers);
    defer a.free(after);
    _ = try result.byteSize(limit);
    return result;
}

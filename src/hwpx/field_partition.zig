//! 분할 문단 그룹의 필드 마커 귀속과 현재 좌표를 원본 연결에 대조합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Position = @import("field_position.zig").Position;

pub fn validate(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, limit: usize) !void {
    return validateMode(a, trees, section, rows, report, limit, false, false);
}

/// 마커/텍스트 귀속을 검증하며 서식 사이트 분할은 호출자의 서식 writer가 검사합니다.
pub fn validateStyled(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, limit: usize) !void {
    return validateMode(a, trees, section, rows, report, limit, true, false);
}

/// Whole computed fields may move, but never become editable text labels.
pub fn validateWholeFormula(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, limit: usize) !void {
    return validateMode(a, trees, section, rows, report, limit, true, true);
}

fn validateMode(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, limit: usize, allow_styles: bool, allow_formula: bool) !void {
    if (section >= trees.len or rows.len == 0) return error.SourceBindingMismatch;
    const first = &rows[0];
    if (first.source_ordinal == null or first.generated_id != null) return error.SourceBindingMismatch;
    const tree = &trees[section];
    const ranges = try @import("field_text_ranges.zig").build(a, trees, report);
    defer a.free(ranges);
    var remaining: std.AutoHashMapUnmanaged(usize, Position) = .empty;
    defer remaining.deinit(a);
    var formula_owners: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer formula_owners.deinit(a);
    for (report.markers) |marker| {
        if (marker.section_ordinal != section or try @import("paragraph_site_owner.zig").ancestor(tree, marker.element_index) != first.template_element) continue;
        const begin_marker = if (marker.kind == .begin) marker else report.markers[marker.matched_marker_index.?];
        const kind = begin_marker.begin.?.type_raw orelse return error.UnsupportedStructuralFieldEdit;
        const formula = allow_formula and std.mem.eql(u8, kind, "FORMULA");
        if ((!@import("field_text_kind.zig").supported(kind) and !formula) or begin_marker.sub_list_children != 0 or begin_marker.unexpected_children != 0) return error.UnsupportedStructuralFieldEdit;
        if (formula) try formula_owners.put(a, begin_marker.element_index, std.math.maxInt(usize));
        if (remaining.count() >= limit) return error.LimitExceeded;
        const begin = if (marker.kind == .begin) marker.element_index else report.markers[marker.matched_marker_index.?].element_index;
        const entry = try remaining.getOrPut(a, marker.element_index);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = .{ .element_index = marker.element_index, .begin_element = begin, .kind = marker.kind, .unit = 0 };
    }
    var open: std.ArrayList(usize) = .empty;
    defer open.deinit(a);
    for (rows, 0..) |*row, ordinal| {
        if (row.template_element != first.template_element) return error.SourceBindingMismatch;
        if (ordinal != 0 and (row.source_ordinal != null or row.generated_id == null)) return error.SourceBindingMismatch;
        if (row.pieces != null or row.protected_positions != null or row.column_boundaries != null or (!allow_styles and row.character_styles != null)) return error.UnsupportedStructuralFieldEdit;
        const owned = row.field_positions orelse return error.SourceBindingMismatch;
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, row);
        defer a.free(locations);
        const positions = try @import("paragraph_text_positions.zig").build(a, tree, &row.sites, locations, 1);
        defer a.free(positions);
        for (positions) |position| if (position.kind != .text) return error.UnsupportedInlineControl;
        var cursor: usize = 0;
        var projected_unit: usize = 0;
        for (owned, 0..) |item, index| {
            if (index != 0 and (item.unit < owned[index - 1].unit or item.element_index <= owned[index - 1].element_index)) return error.InvalidFieldPositions;
            const original = remaining.fetchRemove(item.element_index) orelse return error.SourceBindingMismatch;
            if (item.kind != original.value.kind or item.begin_element != original.value.begin_element) return error.SourceBindingMismatch;
            if (formula_owners.getPtr(item.begin_element)) |owner| {
                if (owner.* == std.math.maxInt(usize)) owner.* = ordinal else if (owner.* != ordinal) return error.ProtectedFieldRange;
            }
            try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, positions, item.unit);
            const at = tree.elements[item.element_index].start_tag.start;
            while (cursor < positions.len and positions[cursor].source_start < at) : (cursor += 1) projected_unit = positions[cursor].end_unit;
            if (item.unit != projected_unit) return error.InvalidFieldPositions;
            if (item.kind == .begin) {
                try open.append(a, item.begin_element);
            } else if (open.items.len != 0) {
                if (open.items[open.items.len - 1] != item.begin_element) return error.InvalidFieldLinks;
                _ = open.pop();
            } else if (remaining.contains(item.begin_element) or item.begin_element >= item.element_index) return error.InvalidFieldLinks;
        }
    }
    if (remaining.count() != 0) return error.SourceBindingMismatch;
}

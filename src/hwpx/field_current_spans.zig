//! 원본 필드 연결과 현재 마커 귀속으로 문단별 필드 범위를 계산합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;
pub const Span = struct { begin_element: usize, paragraph_index: usize, start: usize, end: usize };
const Point = struct { row: usize, unit: usize };

pub fn build(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, report: *const @import("field_markers.zig").Report, limit: usize) ![]Span {
    return buildMode(a, trees, section, current, report, limit, false);
}

pub fn buildWholeFormula(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, report: *const @import("field_markers.zig").Report, limit: usize) ![]Span {
    return buildMode(a, trees, section, current, report, limit, true);
}

/// Raw calculated spans may only authorize a row with no owned markers.
pub fn buildForExterior(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, index: usize, report: *const @import("field_markers.zig").Report, limit: usize) ![]Span {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const positions = current.paragraphs[index].field_positions;
    return buildMode(a, trees, section, current, report, limit, positions != null and positions.?.len == 0);
}

fn buildMode(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, report: *const @import("field_markers.zig").Report, limit: usize, whole_formula: bool) ![]Span {
    if (section >= trees.len) return error.InvalidSectionIndex;
    const tree = &trees[section];
    const ranges = try @import("field_text_ranges.zig").build(a, trees, report);
    defer a.free(ranges);
    var points: std.AutoHashMapUnmanaged(usize, Point) = .empty;
    defer points.deinit(a);
    const lengths = try a.alloc(?usize, current.paragraphs.len);
    defer a.free(lengths);
    @memset(lengths, null);
    var index: usize = 0;
    while (index < current.paragraphs.len) {
        const row = &current.paragraphs[index];
        if (row.field_positions != null) {
            if (row.source_ordinal == null) return error.SourceBindingMismatch;
            if (row.pieces != null) {
                var end = index + 1;
                while (end < current.paragraphs.len and current.paragraphs[end].source_ordinal == null) : (end += 1) {}
                try @import("field_joined_partition.zig").validate(a, trees, section, current.paragraphs[index..end], report, limit);
                index = end;
                continue;
            }
            var end = index + 1;
            while (end < current.paragraphs.len and current.paragraphs[end].source_ordinal == null) : (end += 1) {}
            if (whole_formula) try @import("field_partition.zig").validateWholeFormula(a, trees, section, current.paragraphs[index..end], report, limit) else try @import("field_partition.zig").validateStyled(a, trees, section, current.paragraphs[index..end], report, limit);
            index = end;
        } else index += 1;
    }
    for (current.paragraphs, 0..) |*row, ordinal| {
        var inherited: ?[]@import("field_position.zig").Position = null;
        defer if (inherited) |items| a.free(items);
        const owned = if (row.field_positions) |items| items else inherited_source: {
            var has_marker = false;
            for (report.markers) |marker| {
                if (marker.section_ordinal == section and try @import("paragraph_site_owner.zig").ancestor(tree, marker.element_index) == row.template_element) has_marker = true;
            }
            if (!has_marker) continue;
            inherited = try @import("field_source_positions.zig").build(a, trees, section, row, report, limit);
            break :inherited_source inherited.?;
        };
        for (owned) |position| {
            const entry = try points.getOrPut(a, position.element_index);
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = .{ .row = ordinal, .unit = position.unit };
        }
    }
    var spans: std.ArrayList(Span) = .empty;
    defer spans.deinit(a);
    for (ranges) |range| {
        if (range.section != section) continue;
        const begin_element = report.markers[range.begin_marker].element_index;
        const begin = points.get(begin_element) orelse return error.SourceBindingMismatch;
        const finish = points.get(report.markers[range.end_marker].element_index) orelse return error.SourceBindingMismatch;
        if (begin.row > finish.row or (begin.row == finish.row and begin.unit > finish.unit)) return error.InvalidFieldLinks;
        for (begin.row..finish.row + 1) |row| {
            if (spans.items.len >= limit) return error.LimitExceeded;
            if (row != finish.row and lengths[row] == null) lengths[row] = try length(a, tree, &current.paragraphs[row]);
            try spans.append(a, .{ .begin_element = begin_element, .paragraph_index = row, .start = if (row == begin.row) begin.unit else 0, .end = if (row == finish.row) finish.unit else lengths[row].? });
        }
    }
    return spans.toOwnedSlice(a);
}

fn length(a: std.mem.Allocator, tree: *const Tree, row: *const @import("paragraph_structure_values.zig").Paragraph) !usize {
    if (row.pieces != null and row.field_positions != null) {
        const joined = row.joined().?;
        const projected = try @import("paragraph_joined_positions.zig").buildWithFields(a, tree, &joined);
        defer a.free(projected);
        return if (projected.len == 0) 0 else projected[projected.len - 1].end_unit;
    }
    if (row.pieces != null or row.protected_positions != null) {
        const positions = try @import("paragraph_protected_positions.zig").build(a, tree, row);
        defer a.free(positions);
        return if (positions.len == 0) 0 else positions[positions.len - 1].end_unit;
    }
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, row);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, tree, &row.sites, locations, 1);
    defer a.free(positions);
    return if (positions.len == 0) 0 else positions[positions.len - 1].end_unit;
}

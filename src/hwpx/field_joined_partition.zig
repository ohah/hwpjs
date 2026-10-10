//! 여러 원본 분할 그룹의 출처와 마커를 전체 그룹 단위로 검증합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Position = @import("field_position.zig").Position;

pub fn validate(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, limit: usize) !void {
    if (section >= trees.len or rows.len == 0) return error.SourceBindingMismatch;
    const tree = &trees[section];
    const first = &rows[0];
    if (first.source_ordinal == null or first.generated_id != null) return error.SourceBindingMismatch;
    const provenance = first.pieces orelse return error.SourceBindingMismatch;
    if (provenance.len == 0 or provenance[0].template_element != first.template_element or provenance[0].source_ordinal != first.source_ordinal) return error.SourceBindingMismatch;
    if (provenance.len > limit) return error.LimitExceeded;
    var sources: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer sources.deinit(a);
    for (provenance, 0..) |piece, index| {
        if (!piece.owns_source or piece.source_ordinal == null or piece.generated_id != null) return error.SourceBindingMismatch;
        if ((try sources.getOrPut(a, piece.template_element)).found_existing) return error.SourceBindingMismatch;
        if (index != 0 and try @import("paragraph_source_neighbor.zig").next(tree, provenance[index - 1].template_element) != piece.template_element) return error.InvalidParagraphAdjacency;
    }
    var inventory: std.AutoHashMapUnmanaged(usize, Position) = .empty;
    defer inventory.deinit(a);
    for (report.markers) |marker| {
        if (marker.section_ordinal != section or !sources.contains(try @import("paragraph_site_owner.zig").ancestor(tree, marker.element_index))) continue;
        if (inventory.count() >= limit) return error.LimitExceeded;
        const begin = if (marker.kind == .begin) marker.element_index else report.markers[marker.matched_marker_index orelse return error.InvalidFieldLinks].element_index;
        try inventory.put(a, marker.element_index, .{ .element_index = marker.element_index, .begin_element = begin, .kind = marker.kind, .unit = 0 });
    }
    for (rows, 0..) |*row, ordinal| {
        if (row.template_element != first.template_element or row.protected_positions != null or row.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
        if (ordinal != 0 and (row.source_ordinal != null or row.generated_id == null)) return error.SourceBindingMismatch;
        const joined = row.joined() orelse return error.SourceBindingMismatch;
        try joined.validate();
        if (joined.pieces.len != provenance.len) return error.SourceBindingMismatch;
        for (joined.pieces, provenance) |piece, original| {
            if (piece.template_element != original.template_element or piece.first_site != original.first_site or piece.site_count != original.site_count or piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
            if (ordinal != 0 and (piece.owns_source or piece.source_ordinal != null or piece.generated_id != row.generated_id)) return error.SourceBindingMismatch;
        }
        const owned = row.field_positions orelse return error.SourceBindingMismatch;
        const positions = try @import("field_owned_positions.zig").build(a, tree, row);
        defer a.free(positions);
        const projected = try a.dupe(Position, owned);
        defer a.free(projected);
        try @import("field_position_refresh.zig").refresh(a, tree, projected, positions);
        for (owned, projected) |marker, expected| {
            const source = inventory.fetchRemove(marker.element_index) orelse return error.SourceBindingMismatch;
            if (marker.kind != source.value.kind or marker.begin_element != source.value.begin_element) return error.SourceBindingMismatch;
            if (marker.unit != expected.unit) return error.InvalidFieldPositions;
            try @import("paragraph_text_positions.zig").validateBoundary(&row.sites, positions, marker.unit);
        }
    }
    if (inventory.count() != 0) return error.SourceBindingMismatch;
}

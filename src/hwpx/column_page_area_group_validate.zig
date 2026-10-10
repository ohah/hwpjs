//! 혼합 분할 그룹의 출처와 두 선언 inventory를 함께 검증합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, rows: []const Paragraph) !void {
    if (rows.len == 0) return error.SourceBindingMismatch;
    try @import("column_boundary_joined_group.zig").validate(a, tree, rows);
    const first = &rows[0];
    const original = first.joined().?;
    if (original.pieces[0].template_element != first.template_element or original.pieces[0].source_ordinal != first.source_ordinal) return error.SourceBindingMismatch;
    var inventory: std.ArrayList(@import("page_area_position.zig").Position) = .empty;
    defer inventory.deinit(a);
    for (original.pieces, 0..) |piece, index| {
        if (!tree.elements[piece.template_element].is(@import("document_xml.zig").paragraph_uri, "p") or !piece.owns_source or piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
        if (index != 0) try @import("column_boundary_joined_metadata.zig").validateRightWithPageAreas(tree, piece.template_element);
        const source = try @import("page_area_source_positions.zig").collect(a, tree, piece.template_element, &.{}, tree.elements.len);
        defer a.free(source);
        try inventory.appendSlice(a, source);
    }
    var cursor: usize = 0;
    for (rows) |*row| {
        if (row.protected_positions != null or row.field_positions != null or row.character_styles != null) return error.UnsupportedMixedMetadataPlan;
        const joined = row.joined().?;
        for (joined.pieces) |piece| if (piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
        const segments = try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
        defer a.free(segments);
        for (segments) |segment| if (segment.kind != .text) return error.UnsupportedMixedMetadataPlan;
        try @import("page_area_current_validate.zig").validatePositions(row, segments, inventory.items, true, true);
        for (row.page_area_positions.?) |area| {
            if (cursor >= inventory.items.len or area.source_element != inventory.items[cursor].source_element or area.source_control != inventory.items[cursor].source_control) return error.SourceBindingMismatch;
            cursor += 1;
        }
    }
    if (cursor != inventory.items.len) return error.SourceBindingMismatch;
}

test "mixed declaration group validates original and generated ownership without losing declarations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    const section = &session.sections[0];
    const current = &section.structure_values.?;
    for ([_]u32{ 0, 1, 5 }) |cut| {
        var draft = try @import("column_page_area_split_draft.zig").prepare(a, &section.tree, &current.paragraphs[0], cut, cut, 3, 4000000);
        defer draft.deinit(a);
        var candidate = try @import("paragraph_structure_joined_split.zig").assemble(a, current, 0, 999, 4000000, &draft.text, null, null);
        defer candidate.deinit(a);
        candidate.paragraphs[0].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, draft.metadata.columns.left);
        candidate.paragraphs[1].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, draft.metadata.columns.right);
        candidate.paragraphs[0].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, draft.metadata.areas.left);
        candidate.paragraphs[1].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, draft.metadata.areas.right);
        const rows = candidate.paragraphs[0..2];
        try validate(a, &section.tree, rows);
        try std.testing.checkAllAllocationFailures(a, validate, .{ &section.tree, @as([]const Paragraph, rows) });
        const area = rows[1].page_area_positions.?[1];
        rows[1].page_area_positions.?[1] = rows[1].page_area_positions.?[0];
        try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, rows));
        rows[1].page_area_positions.?[1] = area;
        const owned_areas = rows[1].page_area_positions.?;
        rows[1].page_area_positions = owned_areas[0..1];
        try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, rows));
        rows[1].page_area_positions = owned_areas;
        rows[1].page_area_positions.?[1].source_control = owned_areas[0].source_control;
        try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, rows));
        rows[1].page_area_positions.?[1] = area;
        const owned_columns = rows[0].column_boundaries.?;
        rows[0].column_boundaries = owned_columns[0..0];
        try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, rows));
        rows[0].column_boundaries = owned_columns;
        rows[1].pieces.?[0].generated_id = 998;
        try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, rows));
        rows[1].pieces.?[0].generated_id = 999;
        try validate(a, &section.tree, rows);
    }
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, &.{}));
    for (current.paragraphs[0].page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 5), area.unit);
}

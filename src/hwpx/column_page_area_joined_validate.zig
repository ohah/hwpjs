//! 여러 원본의 단 선언과 쪽 영역을 함께 소유하는 후보를 검증합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    if (paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.protected_positions != null or paragraph.field_positions != null or paragraph.character_styles != null) return error.UnsupportedMixedMetadataPlan;
    const joined = paragraph.joined() orelse return error.MissingJoinedPieces;
    try @import("column_boundary_joined_provenance.zig").validate(tree, &joined);
    const first = joined.pieces[0];
    if (first.template_element != paragraph.template_element or first.source_ordinal != paragraph.source_ordinal) return error.SourceBindingMismatch;
    var inventory: std.ArrayList(@import("page_area_position.zig").Position) = .empty;
    defer inventory.deinit(a);
    for (joined.pieces, 0..) |piece, index| {
        if (!tree.elements[piece.template_element].is(@import("document_xml.zig").paragraph_uri, "p")) return error.SourceBindingMismatch;
        if (!piece.owns_source or piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
        if (index != 0) try @import("column_boundary_joined_metadata.zig").validateRightWithPageAreas(tree, piece.template_element);
        const source = try @import("page_area_source_positions.zig").collect(a, tree, piece.template_element, &.{}, tree.elements.len);
        defer a.free(source);
        try inventory.appendSlice(a, source);
    }
    const columns = paragraph.column_boundaries orelse return error.MissingColumnBoundaries;
    try @import("column_boundary_joined_partition.zig").validate(a, tree, &joined, columns);
    const segments = try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
    defer a.free(segments);
    for (segments) |segment| if (segment.kind != .text) return error.UnsupportedMixedMetadataPlan;
    try @import("page_area_current_validate.zig").validatePositions(paragraph, segments, inventory.items, true, false);
}

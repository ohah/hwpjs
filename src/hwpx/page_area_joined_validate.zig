//! 같은 원본의 순서형 출처와 쪽 영역 좌표를 함께 검증합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    return validateMode(a, tree, paragraph, false);
}

pub fn validateMember(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    return validateMode(a, tree, paragraph, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, partition: bool) !void {
    if ((!partition and paragraph.generated_id != null) or (paragraph.generated_id == null and paragraph.source_ordinal == null) or (paragraph.generated_id != null and (paragraph.generated_id.? == 0 or paragraph.source_ordinal != null)) or paragraph.protected_positions != null or paragraph.column_boundaries != null or paragraph.field_positions != null or paragraph.character_styles != null) return error.UnsupportedPageAreaOwnership;
    const joined = paragraph.joined() orelse return error.MissingJoinedPieces;
    try joined.validate();
    for (joined.pieces, 0..) |piece, index| {
        if (piece.template_element != paragraph.template_element or piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
        if (index == 0 and paragraph.generated_id == null) {
            if (!piece.owns_source or piece.generated_id != null or piece.source_ordinal != paragraph.source_ordinal) return error.SourceBindingMismatch;
        } else if (piece.owns_source or piece.source_ordinal != null or piece.generated_id == null or piece.generated_id.? == 0) return error.SourceBindingMismatch;
        if (index == 0 and paragraph.generated_id != null and piece.generated_id != paragraph.generated_id) return error.SourceBindingMismatch;
    }
    const segments = try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
    defer a.free(segments);
    for (segments) |segment| if (segment.kind != .text) return error.UnsupportedPageAreaOwnership;
    const inventory = try @import("page_area_source_positions.zig").collect(a, tree, paragraph.template_element, &.{}, tree.elements.len);
    defer a.free(inventory);
    try @import("page_area_current_validate.zig").validatePositions(paragraph, segments, inventory, true, partition);
}

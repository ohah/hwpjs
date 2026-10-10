//! 저장과 조회가 공유하는 여러 원본 필드 후보의 출처/마커 검증입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

/// 반환 배열만 소유하며 각 행의 Sites는 후보에서 빌립니다.
pub fn build(a: std.mem.Allocator, trees: []const Tree, section: usize, paragraph: *const Paragraph, report: *const @import("field_markers.zig").Report, limit: usize) ![]Paragraph {
    if (section >= trees.len) return error.InvalidSectionIndex;
    if (paragraph.character_styles != null or paragraph.protected_positions != null or paragraph.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
    const joined = paragraph.joined() orelse return error.SourceBindingMismatch;
    try joined.validate();
    const owned = paragraph.field_positions orelse return error.SourceBindingMismatch;
    if (owned.len > limit or joined.pieces.len > limit) return error.LimitExceeded;
    const rows = try a.alloc(Paragraph, joined.pieces.len);
    errdefer a.free(rows);
    var cursor: usize = 0;
    var base: usize = 0;
    for (joined.pieces, 0..) |piece, index| {
        if (!piece.owns_source or piece.generated_id != null or piece.source_ordinal == null or piece.output != .current_runs or piece.template_only) return error.UnsupportedStructuralFieldEdit;
        if (index != 0 and try @import("paragraph_source_neighbor.zig").next(&trees[section], joined.pieces[index - 1].template_element) != piece.template_element) return error.InvalidParagraphAdjacency;
        rows[index] = try joined.paragraph(index);
        if (index == 0) rows[index].paragraph_shape_id = paragraph.paragraph_shape_id;
        const markers = try @import("field_source_positions.zig").build(a, trees, section, &rows[index], report, limit);
        defer a.free(markers);
        for (markers) |marker| {
            if (cursor >= owned.len) return error.SourceBindingMismatch;
            var expected = marker;
            expected.unit = std.math.add(usize, base, marker.unit) catch return error.LimitExceeded;
            if (!std.meta.eql(expected, owned[cursor])) return error.InvalidFieldPositions;
            cursor += 1;
        }
        for (rows[index].sites.items) |site| base = std.math.add(usize, base, try @import("text_site_edit.zig").utf16Length(site.text)) catch return error.LimitExceeded;
    }
    if (cursor != owned.len) return error.SourceBindingMismatch;
    if (rows.len == 0 or rows[0].template_element != paragraph.template_element or rows[0].source_ordinal != paragraph.source_ordinal) return error.SourceBindingMismatch;
    return rows;
}

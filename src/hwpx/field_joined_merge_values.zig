//! 같은 여러 원본 분할 그룹의 이웃을 텍스트 순서를 유지하며 재병합합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *const model.Values, index: usize, right_index: usize, limit: usize) !model.Values {
    if (section >= trees.len) return error.InvalidSectionIndex;
    if (index >= current.paragraphs.len or right_index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (right_index != index + 1) return error.InvalidParagraphAdjacency;
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[right_index];
    if (left.field_positions == null or right.field_positions == null or left.pieces == null or right.pieces == null or left.paragraph_shape_id != right.paragraph_shape_id or right.source_ordinal != null or right.generated_id == null or left.template_element != right.template_element) return error.UnsupportedStructuralFieldEdit;
    if (left.pieces.?.len != right.pieces.?.len or left.sites.items.len != right.sites.items.len) return error.SourceBindingMismatch;
    for (left.pieces.?, right.pieces.?) |one, two| {
        if (one.template_element != two.template_element or one.first_site != two.first_site or one.site_count != two.site_count or two.owns_source) return error.SourceBindingMismatch;
    }
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const before = try @import("field_current_spans.zig").build(a, trees, section, current, &report, 200_000);
    defer a.free(before);
    var expected: std.ArrayList(u8) = .empty;
    defer expected.deinit(a);
    for ([_]*const model.Paragraph{ left, right }) |row| for (row.sites.items) |site| {
        if (site.text.len > limit -| expected.items.len) return error.LimitExceeded;
        try expected.appendSlice(a, site.text);
    };
    var merged = try left.clone(a);
    defer merged.deinit(a);
    var combined: std.ArrayList(u8) = .empty;
    defer combined.deinit(a);
    var boundary: usize = 0;
    for (left.sites.items, right.sites.items, merged.sites.items) |one, two, *target| {
        if (one.element_index != two.element_index or one.start != two.start or one.end != two.end) return error.SourceBindingMismatch;
        boundary = std.math.add(usize, boundary, try @import("text_site_edit.zig").utf16Length(one.text)) catch return error.LimitExceeded;
        const bytes = try std.mem.concat(a, u8, &.{ one.text, two.text });
        a.free(target.text);
        target.text = bytes;
        if (bytes.len > limit -| combined.items.len) return error.LimitExceeded;
        try combined.appendSlice(a, bytes);
    }
    if (!std.mem.eql(u8, expected.items, combined.items)) return error.UnsupportedTextPositionProjection;
    const markers = try @import("field_merge_positions.zig").prepare(a, left.field_positions.?, right.field_positions.?, boundary, 200_000);
    a.free(merged.field_positions.?);
    merged.field_positions = markers;
    if (left.character_styles != null or right.character_styles != null) {
        if (merged.character_styles) |previous| a.free(previous);
        merged.character_styles = null;
        const styles = try @import("field_style_merge.zig").prepare(a, &trees[section], &merged, left, right, limit / @sizeOf(@import("character_style_paint.zig").Span));
        merged.character_styles = styles;
    }
    const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*row, ordinal| {
        if (ordinal == right_index) continue;
        rows[initialized] = try (if (ordinal == index) &merged else row).clone(a);
        initialized += 1;
    }
    const candidate: model.Values = .{ .paragraphs = rows };
    const after = try @import("field_current_spans.zig").build(a, trees, section, &candidate, &report, 200_000);
    defer a.free(after);
    _ = try candidate.byteSize(limit);
    return candidate;
}

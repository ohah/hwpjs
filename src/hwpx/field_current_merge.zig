//! 같은 원본 필드 그룹의 인접 문단을 현재 텍스트와 마커에서 병합합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, right_index: usize, limit: usize) !model.Values {
    if (index >= current.paragraphs.len or right_index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (right_index != index + 1) return error.InvalidParagraphAdjacency;
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[right_index];
    if (left.field_positions == null or right.field_positions == null or left.template_element != right.template_element or right.source_ordinal != null or right.generated_id == null) return error.UnsupportedStructuralFieldEdit;
    if (left.paragraph_shape_id != right.paragraph_shape_id) return error.UnsupportedStructuralFieldEdit;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const kinds = @import("formula_marker_kind.zig");
    const whole_formula = kinds.owned(&report, section, left.field_positions.?) or kinds.owned(&report, section, right.field_positions.?);
    const before = if (whole_formula) try @import("field_current_spans.zig").buildWholeFormula(a, trees, section, current, &report, 200_000) else try @import("field_current_spans.zig").build(a, trees, section, current, &report, 200_000);
    defer a.free(before);
    var pair = try @import("paragraph_site_union.zig").prepare(a, &trees[section], left.template_element, &left.sites, &right.sites, limit);
    defer pair.deinit(a);
    var expected: std.ArrayList(u8) = .empty;
    defer expected.deinit(a);
    for ([_]*const @import("text_sites.zig").Sites{ &left.sites, &right.sites }) |sites| for (sites.items) |site| {
        if (site.text.len > limit -| expected.items.len) return error.LimitExceeded;
        try expected.appendSlice(a, site.text);
    };
    var combined: std.ArrayList(u8) = .empty;
    defer combined.deinit(a);
    for (pair.left.items, pair.right.items) |*one, two| {
        const bytes = try std.mem.concat(a, u8, &.{ one.text, two.text });
        a.free(one.text);
        one.text = bytes;
        if (bytes.len > limit -| combined.items.len) return error.LimitExceeded;
        try combined.appendSlice(a, bytes);
    }
    if (!std.mem.eql(u8, expected.items, combined.items)) return error.UnsupportedTextPositionProjection;
    const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*row, ordinal| {
        if (ordinal == right_index) continue;
        rows[initialized] = try row.clone(a);
        initialized += 1;
        if (ordinal != index) continue;
        const merged = &rows[initialized - 1];
        const sites = try pair.left.clone(a);
        merged.sites.deinit(a);
        merged.sites = sites;
        if (left.character_styles != null or right.character_styles != null) {
            if (merged.character_styles) |styles| a.free(styles);
            merged.character_styles = null;
            merged.character_styles = try @import("field_style_merge.zig").prepare(a, &trees[section], merged, left, right, limit / @sizeOf(@import("character_style_paint.zig").Span));
        }
        var boundary: usize = 0;
        for (left.sites.items) |site| boundary = std.math.add(usize, boundary, try @import("text_site_edit.zig").utf16Length(site.text)) catch return error.LimitExceeded;
        const markers = try @import("field_merge_positions.zig").prepare(a, left.field_positions.?, right.field_positions.?, boundary, limit / @sizeOf(@import("field_position.zig").Position));
        a.free(merged.field_positions.?);
        merged.field_positions = markers;
        const locations = try @import("paragraph_structure_locations.zig").build(a, &trees[section], merged);
        defer a.free(locations);
        const segments = try @import("paragraph_text_positions.zig").build(a, &trees[section], &merged.sites, locations, 1);
        defer a.free(segments);
        try @import("field_position_refresh.zig").refresh(a, &trees[section], markers, segments);
    }
    const result: model.Values = .{ .paragraphs = rows };
    const after = if (whole_formula) try @import("field_current_spans.zig").buildWholeFormula(a, trees, section, &result, &report, 200_000) else try @import("field_current_spans.zig").build(a, trees, section, &result, &report, 200_000);
    defer a.free(after);
    _ = try result.byteSize(limit);
    return result;
}

//! 원본 필드 문단을 공개 분할 거래의 공통 후보 경로에 연결합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;

pub fn hasSourceField(tree: *const Tree, owner: usize) !bool {
    const uri = @import("document_xml.zig").paragraph_uri;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "fieldBegin") and !element.is(uri, "fieldEnd")) continue;
        if (try @import("paragraph_site_owner.zig").ancestor(tree, index) == owner) return true;
    }
    return false;
}

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, index: usize, start: u32, end: u32, id: u32, limit: usize, max_markers: usize) !?Values {
    if (current.paragraphs[index].field_positions != null and current.paragraphs[index].pieces != null)
        return try @import("field_joined_split_values.zig").prepare(a, trees, section, current, index, start, end, id, limit);
    if (!try hasSourceField(&trees[section], current.paragraphs[index].template_element)) return null;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    if (current.paragraphs[index].field_positions != null) return try @import("field_current_split.zig").prepare(a, trees, section, current, index, start, end, id, &report, limit, max_markers);
    // 계산 필드 등은 기존 일반/수식 분할 정책이 오류 계약을 계속 소유합니다.
    for (report.markers) |marker| {
        if (marker.section_ordinal != section or try @import("paragraph_site_owner.zig").ancestor(&trees[section], marker.element_index) != current.paragraphs[index].template_element) continue;
        const begin = if (marker.kind == .begin) marker else report.markers[marker.matched_marker_index orelse return null];
        const kind = begin.begin.?.type_raw orelse return null;
        if (!@import("field_text_kind.zig").supported(kind)) return null;
    }
    if (current.paragraphs[index].character_styles != null) {
        var materialized = try current.clone(a);
        defer materialized.deinit(a);
        const row = &materialized.paragraphs[index];
        row.field_positions = try @import("field_source_positions.zig").build(a, trees, section, row, &report, max_markers);
        return try @import("field_current_split.zig").prepare(a, trees, section, &materialized, index, start, end, id, &report, limit, max_markers);
    }
    return try @import("field_structure_split.zig").prepare(a, trees, section, current, index, start, end, id, &report, limit, max_markers);
}

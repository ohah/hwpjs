//! 지원 필드가 있는 원본 쌍만 명시적인 필드 병합 후보로 선택합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, index: usize, right_index: usize, limit: usize) !?Values {
    const tree = &trees[section];
    const left = current.paragraphs[index].template_element;
    const right = current.paragraphs[right_index].template_element;
    if (!try @import("field_split_session_candidate.zig").hasSourceField(tree, left) and !try @import("field_split_session_candidate.zig").hasSourceField(tree, right)) return null;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    for (report.markers) |marker| {
        if (marker.section_ordinal != section) continue;
        const owner = try @import("paragraph_site_owner.zig").ancestor(tree, marker.element_index);
        if (owner != left and owner != right) continue;
        const begin = if (marker.kind == .begin) marker else report.markers[marker.matched_marker_index orelse return null];
        const kind = begin.begin.?.type_raw orelse return null;
        if (!@import("field_text_kind.zig").supported(kind)) return null;
    }
    return try @import("field_source_merge_values.zig").prepare(a, trees, section, current, index, right_index, limit);
}

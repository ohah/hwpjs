//! 현재 필드 문단의 단일/여러 원본 텍스트 위치를 같은 좌표로 조회합니다.
const std = @import("std");

pub fn build(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph) ![]@import("paragraph_text_positions.zig").Segment {
    if (paragraph.field_positions == null) return error.SourceBindingMismatch;
    if (paragraph.joined()) |joined| return @import("paragraph_joined_positions.zig").buildWithFields(a, tree, &joined);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    return @import("paragraph_text_positions.zig").buildForFieldText(a, tree, &paragraph.sites, locations, 1);
}

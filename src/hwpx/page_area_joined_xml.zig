//! 순서형 출처의 서식과 현재 쪽 영역 좌표를 한 임시 문단으로 저장합니다.
const std = @import("std");
pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    try @import("page_area_joined_validate.zig").validate(a, tree, paragraph);
    const joined = paragraph.joined().?;
    const base = try @import("paragraph_joined_xml.zig").write(a, tree, &joined, options, limit);
    defer a.free(base);
    return @import("page_area_current_xml.zig").relocateRendered(a, tree, paragraph, paragraph.page_area_positions.?, base, options, limit);
}

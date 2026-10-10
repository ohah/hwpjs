//! 여러 원본 필드 그룹의 검증된 현재 행을 순서대로 XML에 조립합니다.
const std = @import("std");

pub fn write(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, rows: []const @import("paragraph_structure_values.zig").Paragraph, report: *const @import("field_markers.zig").Report, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) ![]u8 {
    try @import("field_joined_partition.zig").validate(a, trees, section, rows, report, 200_000);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (rows) |*row| {
        const xml = try @import("field_source_merge_xml.zig").writeOwnedRow(a, &trees[section], row, fields, limit -| output.items.len);
        defer a.free(xml);
        if (xml.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, xml);
    }
    return output.toOwnedSlice(a);
}

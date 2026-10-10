//! 다단/탭 저장을 재파싱한 문단별 텍스트와 단 설정을 대조합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn verify(a: std.mem.Allocator, source: *const Tree, expected: *const model.Values, saved: *const Tree, options: @import("text_sites.zig").Options, limit: usize) !void {
    var sites = try @import("text_sites.zig").collect(a, saved, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, saved, &sites, options);
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, saved, &sites, locations, options, &report);
    defer current.deinit(a);
    try std.testing.expectEqual(expected.paragraphs.len, current.paragraphs.len);
    for (expected.paragraphs, current.paragraphs) |*before, *after| {
        const wanted = try @import("paragraph_protected_positions.zig").text(a, source, before, limit);
        defer a.free(wanted);
        const actual = try @import("paragraph_protected_positions.zig").text(a, saved, after, limit);
        defer a.free(actual);
        try std.testing.expectEqualStrings(wanted, actual);
        if (before.column_boundaries) |columns| {
            const positions = try @import("paragraph_protected_positions.zig").build(a, saved, after);
            defer a.free(positions);
            const observed = try @import("column_boundary_collect.zig").collect(a, saved, after.template_element, positions, .right, saved.elements.len);
            defer a.free(observed);
            try std.testing.expectEqual(columns.len, observed.len);
            for (columns, observed) |left, right| {
                try std.testing.expectEqual(left.unit, right.unit);
                try std.testing.expectEqualStrings(source.sourceOf(left.source_element), saved.sourceOf(right.source_element));
            }
        }
    }
}
/// 모델 병합 결과를 직렬화와 별개인 문자열 연결로 대조합니다.
pub fn verifyMergedText(a: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, left: *const @import("paragraph_structure_values.zig").Paragraph, right: *const @import("paragraph_structure_values.zig").Paragraph, merged: *const @import("paragraph_structure_values.zig").Paragraph, limit: usize) !void {
    const projection = @import("paragraph_protected_positions.zig");
    const first = try projection.text(a, source, left, limit);
    defer a.free(first);
    const second = try projection.text(a, source, right, limit);
    defer a.free(second);
    const expected = try std.mem.concat(a, u8, &.{ first, second });
    defer a.free(expected);
    const actual = try projection.text(a, source, merged, limit);
    defer a.free(actual);
    try std.testing.expectEqualStrings(expected, actual);
}

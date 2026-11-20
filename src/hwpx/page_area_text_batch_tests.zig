//! Actual XML ownership/metadata candidate, without an external document fixture.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const batch = @import("page_area_text_batch.zig");
const a = std.testing.allocator;
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>needle</p:t><p:ctrl><p:header><p:subList><p:p><p:run><p:t>head</p:t></p:run></p:p></p:subList></p:header></p:ctrl><p:t>needle</p:t></p:run></p:p></s:sec>";
fn prepareCase(allocator: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    var result = (try batch.prepare(allocator, tree, paragraph, &.{
        .{ .start = 0, .end = 6, .text = "한", .expected = "needle" },
        .{ .start = 6, .end = 12, .text = "둘", .expected = "needle" },
    }, 1000)).?;
    defer result.deinit(allocator);
    try std.testing.expectEqual(@as(u32, 2), result.page_area_positions.?[0].unit);
    try std.testing.expectEqual(paragraph.page_area_positions.?[0].source_element, result.page_area_positions.?[0].source_element);
    try std.testing.expectEqual(paragraph.page_area_positions.?[0].source_control, result.page_area_positions.?[0].source_control);
    const text = try @import("paragraph_text_snapshot.zig").copyCurrentText(allocator, &result, 1000);
    defer allocator.free(text);
    try std.testing.expectEqualStrings("한둘", text);
}
test "document text HX page owner batch prepares text and declaration coordinates together through OOM" {
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    const paragraph = &values.paragraphs[0];
    try @import("page_area_materialize.zig").install(a, &tree, paragraph, 2);
    try std.testing.expectEqual(@as(u32, 6), paragraph.page_area_positions.?[0].unit);
    try prepareCase(a, &tree, paragraph);
    try @import("../testing/allocation_failures.zig").check(prepareCase, .{ &tree, @as(*const Paragraph, paragraph) });
    try std.testing.expectEqual(@as(u32, 6), paragraph.page_area_positions.?[0].unit);
    const before = try @import("paragraph_text_snapshot.zig").copyCurrentText(a, paragraph, 1000);
    defer a.free(before);
    try std.testing.expectEqualStrings("needleneedle", before);
    try std.testing.expectError(error.ProtectedPageAreaBoundary, batch.prepare(a, &tree, paragraph, &.{
        .{ .start = 0, .end = 12, .text = "X", .expected = "needleneedle" },
    }, 1000));
    try std.testing.expectError(error.ExpectedTextMismatch, batch.prepare(a, &tree, paragraph, &.{
        .{ .start = 0, .end = 6, .text = "X", .expected = "absent" },
    }, 1000));
    try std.testing.expectEqual(@as(u32, 6), paragraph.page_area_positions.?[0].unit);
}

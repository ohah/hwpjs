//! Detached actual XML/title provenance, with the existing scalar/affinity oracle.
const std = @import("std");
const a = std.testing.allocator;
const batch = @import("title_mark_text_batch.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>needle😀<p:titleMark ignore='false'/>needle</p:t></p:run></p:p></s:sec>";
fn check(allocator: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    var result = (try batch.prepare(allocator, tree, paragraph, &.{
        .{ .start = 0, .end = 6, .text = "한", .expected = "needle" },
        .{ .start = 8, .end = 14, .text = "둘", .expected = "needle" },
    }, .{ .max_bytes = 1000, .max_spans = 1000 }, null)).?;
    defer result.deinit(allocator);
    const text = try @import("paragraph_text_snapshot.zig").copyCurrentText(allocator, &result, 1000);
    defer allocator.free(text);
    try std.testing.expectEqualStrings("한😀둘", text);
    try std.testing.expectEqual(@as(usize, 1), result.title_positions.?.len);
    try std.testing.expectEqual(@as(usize, 4), result.title_positions.?[0].unit);
    try std.testing.expectEqual(paragraph.title_positions.?[0].element_index, result.title_positions.?[0].element_index);
    try std.testing.expectEqual(paragraph.title_positions.?[0].affinity, result.title_positions.?[0].affinity);
}
test "document text HX title batch preserves original marker identity and bulk affinity through OOM" {
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
    paragraph.title_positions = try @import("title_mark_current.zig").read(a, &tree, paragraph);
    try std.testing.expectEqual(@as(usize, 8), paragraph.title_positions.?[0].unit);
    try check(a, &tree, paragraph);
    try @import("../testing/allocation_failures.zig").check(check, .{ @as(*const Tree, &tree), @as(*const Paragraph, paragraph) });
    try std.testing.expectEqual(@as(usize, 8), paragraph.title_positions.?[0].unit);
    try std.testing.expectEqualStrings(source, tree.source);
}
test "document text HX title batch rejects forged ownership sparse units projection and late mismatch" {
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
    paragraph.title_positions = try @import("title_mark_current.zig").read(a, &tree, paragraph);
    const original = paragraph.title_positions.?[0];
    paragraph.title_positions.?[0].element_index = std.math.maxInt(usize);
    try std.testing.expectError(error.SourceBindingMismatch, batch.positions(a, &tree, paragraph));
    paragraph.title_positions.?[0] = original;
    paragraph.title_positions.?[0].unit = 7;
    try std.testing.expectError(error.SplitSurrogatePair, batch.positions(a, &tree, paragraph));
    paragraph.title_positions.?[0].unit = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidTextPosition, batch.positions(a, &tree, paragraph));
    paragraph.title_positions.?[0] = original;
    const duplicate = [_]@import("title_mark_position.zig").Position{ original, original };
    var view = paragraph.*;
    view.title_positions = @constCast(&duplicate);
    try std.testing.expectError(error.SourceBindingMismatch, batch.positions(a, &tree, &view));
    view = paragraph.*;
    view.title_fragment_owners = &.{};
    try std.testing.expectError(error.DocumentTextTitleProjectionRequired, batch.positions(a, &tree, &view));
    try std.testing.expectError(error.ExpectedTextMismatch, batch.prepare(a, &tree, paragraph, &.{
        .{ .start = 0, .end = 6, .text = "한", .expected = "needle" },
        .{ .start = 8, .end = 14, .text = "둘", .expected = "xxxxxx" },
    }, .{ .max_bytes = 1000, .max_spans = 1000 }, null));
    const before = try @import("paragraph_text_snapshot.zig").copyCurrentText(a, paragraph, 1000);
    defer a.free(before);
    try std.testing.expectEqualStrings("needle😀needle", before);
    try std.testing.expectEqualDeep(original, paragraph.title_positions.?[0]);
}

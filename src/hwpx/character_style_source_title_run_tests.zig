const std = @import("std");
const writer = @import("character_style_source_title_run.zig");

test "source-owned styled title gap preserves left XML owner and rejects forged bindings" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), sites.items.len);
    const b = try a.dupe(u8, "BY");
    a.free(sites.items[0].text);
    sites.items[0].text = b;
    const c = try a.dupe(u8, "");
    a.free(sites.items[1].text);
    sites.items[1].text = c;
    const run = tree.elements[sites.items[0].element_index].parent.?;
    const paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = tree.elements[run].parent.?, .source_ordinal = 1, .sites = sites };
    var spans = [_]@import("character_style_paint.zig").Span{
        .{ .start_unit = 0, .end_unit = 2, .site_start_unit = 0, .site_index = 0, .run_element = run, .char_shape_id = 7 },
        .{ .start_unit = 2, .end_unit = 2, .site_start_unit = 2, .site_index = 1, .run_element = run, .char_shape_id = 7 },
    };
    const output = (try writer.tryWrite(a, &tree, &paragraph, &spans, &.{}, 10000)).?;
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>BY<p:titleMark ignore='1'/></p:t>") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "titleMark"));
    try std.testing.expectEqualStrings(xml, tree.source);
    sites.items[1].end -= 1;
    try std.testing.expectError(error.InvalidTextSites, writer.tryWrite(a, &tree, &paragraph, &spans, &.{}, 10000));
    sites.items[1].end += 1;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn exercise(allocator: std.mem.Allocator, input_tree: *const @import("xml_part_tree.zig").Tree, input_paragraph: *const @import("paragraph_structure_values.zig").Paragraph, input_spans: []const @import("character_style_paint.zig").Span) !void {
            const serialized = (try writer.tryWrite(allocator, input_tree, input_paragraph, input_spans, &.{}, 10000)) orelse return error.ExpectedTitleRun;
            defer allocator.free(serialized);
        }
    }.exercise, .{ &tree, &paragraph, &spans });
    spans[1].char_shape_id = 9;
    const styled = (try writer.tryWrite(a, &tree, &paragraph, &spans, &.{}, 10000)).?;
    defer a.free(styled);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, styled, "<p:titleMark"));
    try std.testing.expect(std.mem.indexOf(u8, styled, "charPrIDRef='9'><p:t></p:t>") != null);
}

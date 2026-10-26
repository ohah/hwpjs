const std = @import("std");
const writer = @import("character_style_source_title_run.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Span = @import("character_style_paint.zig").Span;

test "source title run preserves old empty text style and emits owned field controls once" {
    const a = std.testing.allocator;
    const uri = @import("document_xml.zig").paragraph_uri;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:secPr/><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t/><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), sites.items.len);
    const run = tree.elements[sites.items[0].element_index].parent.?;
    var begin: usize = 0;
    var end: usize = 0;
    for (tree.elements, 0..) |node, i| {
        if (node.is(uri, "fieldBegin")) begin = i;
        if (node.is(uri, "fieldEnd")) end = i;
    }
    var fields = [_]@import("field_position.zig").Position{
        .{ .element_index = begin, .begin_element = begin, .kind = .begin, .unit = 1 },
        .{ .element_index = end, .begin_element = begin, .kind = .end, .unit = 2 },
    };
    const paragraph: Paragraph = .{ .template_element = tree.elements[run].parent.?, .source_ordinal = 1, .sites = sites, .field_positions = &fields };
    var spans = [_]Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = run, .char_shape_id = 9 },
        .{ .start_unit = 1, .end_unit = 2, .site_start_unit = 1, .site_index = 1, .run_element = run, .char_shape_id = 9 },
        .{ .start_unit = 2, .end_unit = 2, .site_start_unit = 2, .site_index = 2, .run_element = run, .char_shape_id = 7 },
        .{ .start_unit = 2, .end_unit = 3, .site_start_unit = 2, .site_index = 3, .run_element = run, .char_shape_id = 9 },
        .{ .start_unit = 3, .end_unit = 4, .site_start_unit = 3, .site_index = 4, .run_element = run, .char_shape_id = 9 },
    };
    const output = (try writer.tryWrite(a, &tree, &paragraph, &spans, &.{}, 10000)) orelse return error.ExpectedTitleRun;
    defer a.free(output);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:fieldEnd"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:titleMark"));
    const wrapped = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", output, "</p:p></s:sec>" });
    defer a.free(wrapped);
    var saved = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer saved.deinit(a);
    var saved_sites = try @import("text_sites.zig").collect(a, &saved, .{});
    defer saved_sites.deinit(a);
    try std.testing.expectEqual(sites.items.len, saved_sites.items.len);
    for (sites.items, saved_sites.items, 0..) |before, after, i| {
        try std.testing.expectEqualStrings(before.text, after.text);
        try std.testing.expectEqual(before.empty_element, after.empty_element);
        const owner = saved.elements[after.element_index].parent.?;
        try std.testing.expectEqual(@as(?u32, if (i == 2) 7 else 9), try @import("character_style_projection.zig").runId(a, &saved, owner));
    }
    const Probe = struct {
        fn exercise(allocator: std.mem.Allocator, input_tree: *const Tree, input_paragraph: *const Paragraph, input_spans: []const Span) !void {
            const bytes = (try writer.tryWrite(allocator, input_tree, input_paragraph, input_spans, &.{}, 10000)) orelse return error.ExpectedTitleRun;
            defer allocator.free(bytes);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.exercise, .{ &tree, &paragraph, &spans });
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqual(@as(?u32, 7), spans[2].char_shape_id);
    const dirty = [_]@import("text_sites_save.zig").FieldDirty{.{ .element_index = begin, .dirty = true }};
    const dirty_output = (try writer.tryWrite(a, &tree, &paragraph, &spans, &dirty, 10000)).?;
    defer a.free(dirty_output);
    try std.testing.expect(std.mem.indexOf(u8, dirty_output, "dirty='1'") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:secPr"));
    var continuation = paragraph;
    continuation.generated_id = 99;
    const continued = (try writer.tryWrite(a, &tree, &continuation, &spans, &.{}, 10000)).?;
    defer a.free(continued);
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, continued, "<p:secPr"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, continued, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, continued, "<p:fieldEnd"));
    try std.testing.expectError(error.LimitExceeded, writer.tryWrite(a, &tree, &paragraph, &spans, &.{}, 1));
    // 같은 원본 t의 B와 C는 별도 style fragment로 보존합니다.
    spans[4].char_shape_id = 8;
    const partitioned = (try writer.tryWrite(a, &tree, &paragraph, &spans, &.{}, 10000)).?;
    defer a.free(partitioned);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, partitioned, "<p:titleMark"));
    try std.testing.expect(std.mem.indexOf(u8, partitioned, "charPrIDRef='8'><p:t>C</p:t>") != null);
}

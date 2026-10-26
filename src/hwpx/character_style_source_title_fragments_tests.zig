//! 검증된 원본 collector/projection/paint를 경유하는 다중 서식 직렬화 후보입니다.
const std = @import("std");
const title = @import("character_style_source_title_run.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Span = @import("character_style_paint.zig").Span;
const uri = @import("document_xml.zig").paragraph_uri;
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:secPr/><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t/><p:t>BC<p:titleMark ignore='1'/>DE</p:t></p:run></p:p></s:sec>";

fn exercise(a: std.mem.Allocator, assertions: bool) !void {
    return exerciseImpl(a, assertions, false);
}

fn exerciseImpl(a: std.mem.Allocator, assertions: bool, materialize: bool) !void {
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    if (materialize) _ = try @import("text_site_edit.zig").splice(a, &sites, 2, 0, 0, "Q😀", 1000);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").buildForFieldText(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &sites, positions, 100);
    defer a.free(projection);
    const original = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    defer a.free(original);
    // 같은 원본 t의 BC/DE 각각의 내부를 나눕니다. marker는 C 뒤에 정확 한 번 남습니다.
    const spans = try @import("character_style_paint.zig").prepare(a, &sites, original, 3, 5, 9, &.{ 7, 9 }, 100);
    defer a.free(spans);
    const run = spans[0].run_element;
    var begin: usize = 0;
    var end: usize = 0;
    for (tree.elements, 0..) |element, i| {
        if (element.is(uri, "fieldBegin")) begin = i;
        if (element.is(uri, "fieldEnd")) end = i;
    }
    var owned = [_]@import("field_position.zig").Position{
        .{ .element_index = begin, .begin_element = begin, .kind = .begin, .unit = 1 },
        .{ .element_index = end, .begin_element = begin, .kind = .end, .unit = 2 },
    };
    var paragraph: Paragraph = .{ .template_element = tree.elements[run].parent.?, .source_ordinal = 1, .sites = sites, .field_positions = &owned };
    const fields = [_]@import("text_sites_save.zig").FieldDirty{.{ .element_index = begin, .dirty = true }};
    const saved = (try title.tryWrite(a, &tree, &paragraph, spans, &fields, 10000)) orelse return error.ExpectedTitleRun;
    defer a.free(saved);
    if (materialize) {
        try std.testing.expectEqualStrings(xml, tree.source);
        try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='7'><p:t>Q</p:t>") != null);
        try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='9'><p:t>😀</p:t>") != null);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:titleMark"));
        if (assertions) try std.testing.expectError(error.SplitSurrogatePair, @import("character_style_paint.zig").prepare(a, &sites, original, 3, 4, 9, &.{ 7, 9 }, 100));
        if (assertions) try std.testing.expectError(error.LimitExceeded, title.tryWrite(a, &tree, &paragraph, spans, &fields, saved.len - 1));
        return;
    }
    if (!assertions) return;
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:titleMark"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:fieldEnd"));
    try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='9'><p:t>C<p:titleMark ignore='1'/></p:t></p:run>") != null);
    try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='7'><p:t/></p:run>") != null);
    try std.testing.expect(std.mem.indexOf(u8, saved, "dirty='1'") != null);
    try std.testing.expectError(error.LimitExceeded, title.tryWrite(a, &tree, &paragraph, spans, &fields, saved.len - 1));
    paragraph.generated_id = 99;
    const continued = (try title.tryWrite(a, &tree, &paragraph, spans, &fields, 10000)).?;
    defer a.free(continued);
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, continued, "<p:secPr"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, continued, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, continued, "<p:fieldEnd"));
    paragraph.generated_id = null;
    const old_start = sites.items[0].start;
    paragraph.sites.items[0].start += 1;
    try std.testing.expectError(error.InvalidTextSites, title.tryWrite(a, &tree, &paragraph, spans, &fields, 10000));
    paragraph.sites.items[0].start = old_start;
    var moved = [_]@import("title_mark_position.zig").Position{.{ .element_index = begin, .unit = 4 }};
    paragraph.title_positions = &moved;
    try std.testing.expect((try title.tryWrite(a, &tree, &paragraph, spans, &fields, 10000)) == null);
    paragraph.title_positions = null;
    const duplicated = [_]@import("text_sites_save.zig").FieldDirty{ fields[0], fields[0] };
    try std.testing.expectError(error.DuplicateFieldDirty, title.tryWrite(a, &tree, &paragraph, spans, &duplicated, 10000));
    // 검증용 출력을 같은 collector로 읽어 빈 owner와 UTF16 style partition을 확인합니다.
    const wrapped = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", saved, "</p:p></s:sec>" });
    defer a.free(wrapped);
    var output_tree = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer output_tree.deinit(a);
    var output_sites = try @import("text_sites.zig").collect(a, &output_tree, .{});
    defer output_sites.deinit(a);
    const expected = [_][]const u8{ "X", "A", "", "B", "C", "D", "E" };
    const styles = [_]u32{ 7, 7, 7, 7, 9, 9, 7 };
    try std.testing.expectEqual(expected.len, output_sites.items.len);
    for (output_sites.items, expected, styles) |site, value, id| {
        try std.testing.expectEqualStrings(value, site.text);
        try std.testing.expectEqual(@as(?u32, id), try @import("character_style_projection.zig").runId(a, &output_tree, output_tree.elements[site.element_index].parent.?));
    }
}

test "source title multistyle marker once empty source style dirty and limits" {
    try exercise(std.testing.allocator, true);
}

test "source title multistyle allocation failures keep borrowed input intact" {
    try @import("../testing/allocation_failures.zig").check(exercise, .{false});
}

test "source title multistyle does not admit unknown inline children" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>B<p:titleMark ignore='1'/><p:unknown/>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectError(error.UnsupportedInlineControl, @import("paragraph_text_positions.zig").buildForFieldText(a, &tree, &sites, locations, 1));
    const run = tree.elements[sites.items[0].element_index].parent.?;
    const paragraph: Paragraph = .{ .template_element = tree.elements[run].parent.?, .source_ordinal = 1, .sites = sites };
    const spans = [_]Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = run, .char_shape_id = 7 },
        .{ .start_unit = 1, .end_unit = 2, .site_start_unit = 1, .site_index = 1, .run_element = run, .char_shape_id = 9 },
    };
    try std.testing.expect((try title.tryWrite(a, &tree, &paragraph, &spans, &.{}, 10000)) == null);
    try std.testing.expectEqualStrings(input, tree.source);
}

test "source title materialized empty site preserves style partitions and surrogate boundary" {
    try exerciseImpl(std.testing.allocator, true, true);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn invoke(a: std.mem.Allocator) !void {
            try exerciseImpl(a, false, true);
        }
    }.invoke, .{});
}

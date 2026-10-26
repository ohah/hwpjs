//! 실제 Session options로 leading/trailing title synthetic zero site를 검증하는 회귀 후보입니다.
const std = @import("std");
const title = @import("character_style_source_title_run.zig");
const leading_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t><p:titleMark ignore='1'/>BC</p:t></p:run></p:p></s:sec>";
const trailing_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>BC<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";

fn exercise(a: std.mem.Allocator, leading: bool, whole: bool, assertions: bool) !void {
    const xml = if (leading) leading_xml else trailing_xml;
    const options = @import("editor_session.zig").siteOptions(.{});
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").buildForFieldText(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &sites, positions, 100);
    defer a.free(projection);
    const original = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    defer a.free(original);
    const spans = try @import("character_style_paint.zig").prepare(a, &sites, original, if (whole) 0 else 2, if (whole) 4 else 3, 9, &.{ 7, 9 }, 100);
    defer a.free(spans);
    const run = spans[0].run_element;
    const uri = @import("document_xml.zig").paragraph_uri;
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
    var row: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = tree.elements[run].parent.?, .source_ordinal = 1, .sites = sites, .field_positions = &owned, .character_styles = spans };
    // default 재수집의 실패 분기와 canonical 옵션 경로를 같은 실제 collector 입력으로 비교합니다.
    const saved = (try title.tryWriteOptions(a, &tree, &row, spans, &.{}, options, 10000)) orelse return error.ExpectedTitleRun;
    defer a.free(saved);
    if (!assertions) return;
    try std.testing.expectEqual(@as(usize, 4), sites.items.len);
    const zero_index: usize = if (leading) 2 else 3;
    const zero = sites.items[zero_index];
    try std.testing.expectEqual(@as(usize, 0), zero.text.len);
    try std.testing.expectEqual(zero.start, zero.end);
    try std.testing.expectEqual(if (leading) tree.elements[zero.element_index].start_tag.end else tree.elements[zero.element_index].end_tag.?.start, zero.start);
    try std.testing.expect(!zero.missing_text and !zero.anchor_boundary and !zero.empty_element);
    try std.testing.expectError(if (leading) error.InvalidTextSites else error.SourceBindingMismatch, title.tryWrite(a, &tree, &row, spans, &.{}, 10000));
    const old_zero_fragment = if (leading) "charPrIDRef='7'><p:t><p:titleMark ignore='1'/></p:t></p:run>" else "charPrIDRef='7'><p:t></p:t></p:run>";
    try std.testing.expect(std.mem.indexOf(u8, saved, old_zero_fragment) != null);
    if (!leading) {
        const visible_tail = if (whole) "charPrIDRef='9'><p:t>BC<p:titleMark ignore='1'/></p:t>" else "charPrIDRef='7'><p:t>C<p:titleMark ignore='1'/></p:t>";
        try std.testing.expect(std.mem.indexOf(u8, saved, visible_tail) != null);
    }
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:titleMark"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:fieldEnd"));
    try std.testing.expectEqual(@as(?u32, 7), spans[if (leading) 2 else spans.len - 1].char_shape_id);
    const paragraph_xml = try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, &tree, &row, &.{}, options, 10000);
    defer a.free(paragraph_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, paragraph_xml, "<p:titleMark"));
    try std.testing.expectError(error.LimitExceeded, title.tryWriteOptions(a, &tree, &row, spans, &.{}, options, saved.len - 1));
    row.sites.items[zero_index].start += 1;
    try std.testing.expectError(error.InvalidTextSites, title.tryWriteOptions(a, &tree, &row, spans, &.{}, options, 10000));
    row.sites.items[zero_index].start -= 1;
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "source title canonical options leading zero owner whole and partial" {
    try exercise(std.testing.allocator, true, true, true);
    try exercise(std.testing.allocator, true, false, true);
}

test "source title canonical options OOM retains zero binding" {
    try @import("../testing/allocation_failures.zig").check(exercise, .{ true, true, false });
    try @import("../testing/allocation_failures.zig").check(exercise, .{ true, false, false });
}

test "source title canonical trailing zero whole and partial preserve old empty owner" {
    try exercise(std.testing.allocator, false, true, true);
    try exercise(std.testing.allocator, false, false, true);
}

test "source title canonical trailing OOM zero binding unchanged" {
    try @import("../testing/allocation_failures.zig").check(exercise, .{ false, true, false });
    try @import("../testing/allocation_failures.zig").check(exercise, .{ false, false, false });
}

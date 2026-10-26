//! Focused writer operation; no public lifecycle setup or raw artifact dumps.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Span = @import("character_style_paint.zig").Span;
const writer = @import("character_style_source_title_run.zig");

fn exercise(a: std.mem.Allocator, count: usize, check_oom: bool) !void {
    const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:secPr/><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>";
    const tail = "<p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    try source.appendSlice(a, head);
    for (0..count) |_| try source.appendSlice(a, "<p:t>x</p:t><p:t/>");
    try source.appendSlice(a, tail);
    var tree = try @import("xml_part_tree.zig").parse(a, source.items, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const run = tree.elements[sites.items[0].element_index].parent.?;
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").buildForFieldText(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &sites, positions, 1_000_000);
    defer a.free(projection);
    const spans = try @import("character_style_paint.zig").fromProjection(a, projection, 1_000_000);
    defer a.free(spans);
    for (spans) |*span| span.char_shape_id = if (span.start_unit == span.end_unit) 7 else 9;
    for (sites.items) |*site| if (std.mem.eql(u8, site.text, "x")) {
        const text = try a.dupe(u8, "y");
        a.free(site.text);
        site.text = text;
    };
    var begin: usize = 0;
    var end: usize = 0;
    const uri = @import("document_xml.zig").paragraph_uri;
    for (tree.elements, 0..) |node, i| {
        if (node.is(uri, "fieldBegin")) begin = i;
        if (node.is(uri, "fieldEnd")) end = i;
    }
    var owned = [_]@import("field_position.zig").Position{
        .{ .element_index = begin, .begin_element = begin, .kind = .begin, .unit = 1 },
        .{ .element_index = end, .begin_element = begin, .kind = .end, .unit = 2 },
    };
    const paragraph: Paragraph = .{ .template_element = tree.elements[run].parent.?, .source_ordinal = null, .generated_id = 99, .sites = sites, .field_positions = &owned };
    const dirty = [_]@import("text_sites_save.zig").FieldDirty{.{ .element_index = begin, .dirty = true }};
    var expected: std.ArrayList(u8) = .empty;
    defer expected.deinit(a);
    try expected.appendSlice(a, "<p:run charPrIDRef='9'><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='1'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>");
    for (0..count) |i| {
        if (i != 0) try expected.appendSlice(a, "<p:run charPrIDRef='9'>");
        try expected.appendSlice(a, "<p:t>y</p:t></p:run><p:run charPrIDRef='7'><p:t/></p:run>");
    }
    try expected.appendSlice(a, "<p:run charPrIDRef='9'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run>");
    const bytes = (try writer.tryWrite(a, &tree, &paragraph, spans, &dirty, 16 * 1024 * 1024)) orelse return error.ExpectedTitleRun;
    defer a.free(bytes);
    try std.testing.expectEqualStrings(expected.items, bytes);
    try std.testing.expectError(error.LimitExceeded, writer.tryWrite(a, &tree, &paragraph, spans, &dirty, bytes.len - 1));
    if (check_oom) try std.testing.checkAllAllocationFailures(a, struct {
        fn invokeWriter(allocator: std.mem.Allocator, t: *const Tree, p: *const Paragraph, styles: []const Span, fields: []const @import("text_sites_save.zig").FieldDirty) !void {
            const output = (try writer.tryWrite(allocator, t, p, styles, fields, 16 * 1024 * 1024)) orelse return error.ExpectedTitleRun;
            defer allocator.free(output);
        }
    }.invokeWriter, .{ &tree, &paragraph, spans, &dirty });
    try std.testing.expectEqualStrings(source.items, tree.source);
}

test "title cursor control dirty continuation text changes OOM and limit" {
    try exercise(std.testing.allocator, 4, true);
}
test "title cursor scaling 64" {
    try exercise(std.testing.allocator, 64, false);
}
test "title cursor scaling 256" {
    try exercise(std.testing.allocator, 256, false);
}
test "title cursor scaling 1024" {
    try exercise(std.testing.allocator, 1024, false);
}

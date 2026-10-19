const std = @import("std");
test "HWPX styled field control-only runs preserve ownership and dirty through allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK' dirty='0'/></p:ctrl></p:run><p:run><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var begin: usize = 0;
    var finish: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = index;
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldEnd")) finish = index;
    }
    var markers = [_]@import("field_position.zig").Position{
        .{ .element_index = begin, .begin_element = begin, .kind = .begin, .unit = 0 },
        .{ .element_index = finish, .begin_element = begin, .kind = .end, .unit = 1 },
    };
    var styles = [_]@import("character_style_paint.zig").Span{.{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = tree.elements[sites.items[0].element_index].parent.?, .char_shape_id = 9 }};
    var row: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 1, .source_ordinal = null, .generated_id = 8, .sites = sites, .field_positions = markers[1..], .character_styles = &styles };
    const removed = try @import("character_style_paragraph_xml.zig").writeFieldsDirty(a, &tree, &row, &.{.{ .element_index = begin, .dirty = true }}, 4000);
    defer a.free(removed);
    try std.testing.expect(std.mem.indexOf(u8, removed, "fieldBegin") == null);
    row.field_positions = &markers;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, marker: usize) !void {
            const xml = try @import("character_style_paragraph_xml.zig").writeFieldsDirty(allocator, parsed, paragraph, &.{.{ .element_index = marker, .dirty = true }}, 4000);
            defer allocator.free(xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "fieldBegin"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "dirty='1'"));
        }
    }.run, .{ &tree, &row, begin });
}

test "HWPX styled field continuation retains markers without duplicating section settings" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10'><p:run charPrIDRef='7'><p:secPr/><p:ctrl><p:colPr/></p:ctrl><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var begin: usize = 0;
    var finish: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = index;
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldEnd")) finish = index;
    }
    var owned = [_]@import("field_position.zig").Position{
        .{ .element_index = begin, .begin_element = begin, .kind = .begin, .unit = 0 },
        .{ .element_index = finish, .begin_element = begin, .kind = .end, .unit = 1 },
    };
    var spans = [_]@import("character_style_paint.zig").Span{.{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = tree.elements[sites.items[0].element_index].parent.?, .char_shape_id = 9 }};
    var paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites, .field_positions = &owned, .character_styles = &spans };
    const original = try @import("character_style_paragraph_xml.zig").write(a, &tree, &paragraph, 4000);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, original, "secPr"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, original, "colPr"));
    paragraph.source_ordinal = null;
    paragraph.generated_id = 8;
    const continuation = try @import("character_style_paragraph_xml.zig").write(a, &tree, &paragraph, 4000);
    defer a.free(continuation);
    try std.testing.expect(std.mem.indexOf(u8, continuation, "secPr") == null);
    try std.testing.expect(std.mem.indexOf(u8, continuation, "colPr") == null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, continuation, "fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, continuation, "fieldEnd"));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, row: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            const output = try @import("character_style_paragraph_xml.zig").write(allocator, parsed, row, 4000);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "secPr") == null);
            try std.testing.expect(std.mem.indexOf(u8, output, "colPr") == null);
        }
    }.run, .{ &tree, &paragraph });
}

test "HWPX styled field fragments retain only current owned marker controls" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><!--label--><p:t>A😀</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const span: @import("character_style_paint.zig").Span = .{ .start_unit = 0, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 9 };
    var owned = [_]@import("field_position.zig").Position{.{ .element_index = 4, .begin_element = 4, .kind = .begin, .unit = 0 }};
    const result = try @import("character_style_run_fragment.zig").writeFields(a, &tree, &sites, span, 4000, true, true, &owned);
    defer a.free(result);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, result, "fieldBegin"));
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, result, "fieldEnd"));
    try std.testing.expect(std.mem.indexOf(u8, result, "charPrIDRef='9'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "<!--label--><p:t>A😀</p:t>") != null);
    var first = span;
    first.end_unit = 1;
    var second = span;
    second.start_unit = 1;
    second.char_shape_id = 8;
    var split_spans = [_]@import("character_style_paint.zig").Span{ first, second };
    const assembled = try @import("character_style_run_xml.zig").writeFields(a, &tree, &sites, &split_spans, &owned, 4000);
    defer a.free(assembled);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, assembled, "fieldBegin"));
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, assembled, "fieldEnd"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, assembled, "<!--label-->"));
    try std.testing.expect(std.mem.indexOf(u8, assembled, "<p:t>A</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, assembled, "<p:t>😀</p:t>") != null);
    const paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 1, .source_ordinal = null, .generated_id = 8, .sites = sites, .field_positions = &owned, .character_styles = &split_spans };
    const paragraph_xml = try @import("character_style_paragraph_xml.zig").write(a, &tree, &paragraph, 4000);
    defer a.free(paragraph_xml);
    try std.testing.expect(std.mem.indexOf(u8, paragraph_xml, "id=\"8\"") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, paragraph_xml, "fieldBegin"));
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, paragraph_xml, "fieldEnd"));
    const dirty_xml = try @import("character_style_paragraph_xml.zig").writeFieldsDirty(a, &tree, &paragraph, &.{.{ .element_index = 4, .dirty = true }}, 4000);
    defer a.free(dirty_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, dirty_xml, "dirty=\"1\""));
    try std.testing.expectError(error.DuplicateFieldDirty, @import("character_style_paragraph_xml.zig").writeFieldsDirty(a, &tree, &paragraph, &.{ .{ .element_index = 4, .dirty = true }, .{ .element_index = 4, .dirty = false } }, 4000));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const @import("text_sites.zig").Sites, piece: @import("character_style_paint.zig").Span) !void {
            const output = try @import("character_style_run_fragment.zig").writeFields(allocator, parsed, current, piece, 4000, true, true, &.{});
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "fieldBegin") == null);
            try std.testing.expect(std.mem.indexOf(u8, output, "fieldEnd") == null);
            var left = piece;
            left.end_unit = 1;
            var right = piece;
            right.start_unit = 1;
            const combined = try @import("character_style_run_xml.zig").writeFields(allocator, parsed, current, &.{ left, right }, &.{}, 4000);
            defer allocator.free(combined);
            try std.testing.expect(std.mem.indexOf(u8, combined, "fieldBegin") == null);
            try std.testing.expect(std.mem.indexOf(u8, combined, "fieldEnd") == null);
            var styles = [_]@import("character_style_paint.zig").Span{ left, right };
            const row: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 1, .source_ordinal = null, .generated_id = 8, .sites = current.*, .field_positions = &.{}, .character_styles = &styles };
            const xml = try @import("character_style_paragraph_xml.zig").write(allocator, parsed, &row, 4000);
            defer allocator.free(xml);
            try std.testing.expect(std.mem.indexOf(u8, xml, "fieldBegin") == null);
            try std.testing.expect(std.mem.indexOf(u8, xml, "fieldEnd") == null);
            var markers = [_]@import("field_position.zig").Position{.{ .element_index = 4, .begin_element = 4, .kind = .begin, .unit = 0 }};
            var owned_row = row;
            owned_row.field_positions = &markers;
            const dirty = try @import("character_style_paragraph_xml.zig").writeFieldsDirty(allocator, parsed, &owned_row, &.{.{ .element_index = 4, .dirty = true }}, 4000);
            defer allocator.free(dirty);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, dirty, "dirty=\"1\""));
        }
    }.run, .{ &tree, &sites, span });
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectEqualStrings("A😀", sites.items[0].text);
}

test "HWPX character style run XML partitions multiple text sites without duplicating metadata" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7' opaque='run'><!--prefix--><p:t>A😀</p:t><!--between--><p:t opaque='second'>B&lt;&amp;</p:t><?suffix keep?></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), sites.items.len);
    const Span = @import("character_style_paint.zig").Span;
    const spans = [_]Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 7 },
        .{ .start_unit = 1, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 9 },
        .{ .start_unit = 3, .end_unit = 4, .site_start_unit = 3, .site_index = 1, .run_element = 2, .char_shape_id = 9 },
        .{ .start_unit = 4, .end_unit = 6, .site_start_unit = 3, .site_index = 1, .run_element = 2, .char_shape_id = 7 },
    };
    const result = try @import("character_style_run_xml.zig").write(a, &tree, &sites, &spans, 2000);
    defer a.free(result);
    for ([_][]const u8{ "<!--prefix-->", "<!--between-->", "<?suffix keep?>" }) |marker| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, result, marker));
    const expected = "<p:run charPrIDRef='7' opaque='run'><!--prefix--><p:t>A</p:t></p:run><p:run charPrIDRef='9' opaque='run'><p:t>😀</p:t></p:run><p:run charPrIDRef='9' opaque='run'><!--between--><p:t opaque='second'>B</p:t></p:run><p:run charPrIDRef='7' opaque='run'><p:t opaque='second'>&lt;&amp;</p:t><?suffix keep?></p:run>";
    try std.testing.expectEqualStrings(expected, result);
    var shifted = spans;
    for (&shifted) |*span| {
        span.start_unit += 100;
        span.end_unit += 100;
        span.site_start_unit += 100;
    }
    const closed = try @import("character_style_run_closed.zig").write(a, &tree, &sites, &shifted, 3000);
    defer a.free(closed);
    for ([_][]const u8{ "<!--prefix-->", "<!--between-->", "<?suffix keep?>" }) |marker| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, closed, marker));
    try std.testing.expect(std.mem.indexOf(u8, closed, "xmlns:p=") != null);
    try std.testing.expectError(error.SourceBindingMismatch, @import("character_style_run_xml.zig").write(a, &tree, &sites, spans[0..2], 2000));
    try std.testing.expectError(error.LimitExceeded, @import("character_style_run_xml.zig").write(a, &tree, &sites, &spans, result.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, partition: []const Span) !void {
            const rendered = try @import("character_style_run_xml.zig").write(allocator, t, s, partition, 2000);
            defer allocator.free(rendered);
            const scoped = try @import("character_style_run_closed.zig").write(allocator, t, s, partition, 3000);
            defer allocator.free(scoped);
        }
    }.run, .{ &tree, &sites, &spans });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX character style run XML refuses field-like controls outside the retention contract" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<f:ctrl><p:fieldBegin id='1'/></f:ctrl>",
        "<p:ctrl><f:fieldBegin id='1'/></p:ctrl>",
        "<p:ctrl><p:fieldBegin id='1'/><p:fieldEnd beginIDRef='1'/></p:ctrl>",
        "<p:ctrl>unowned<p:fieldBegin id='1'/></p:ctrl>",
        "<p:ctrl><p:footNote/></p:ctrl>",
    }) |control| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:p><p:run charPrIDRef='7'>", control, "<p:t>A</p:t></p:run></p:p></s:sec>" });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        try std.testing.expect(!@import("retained_field_marker.zig").supported(&tree, 3));
        const span: @import("character_style_paint.zig").Span = .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 9 };
        try std.testing.expectError(error.UnsupportedInlineControl, @import("character_style_run_xml.zig").write(a, &tree, &sites, &.{span}, 1000));
    }
}

test "HWPX character style run XML saves complete partition and reopens without text loss" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7' opaque='run'><!--prefix--><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t opaque='text'>A😀B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><?suffix keep?></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const Span = @import("character_style_paint.zig").Span;
    const original: Span = .{ .start_unit = 0, .end_unit = 4, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 7 };
    const spans = try @import("character_style_paint.zig").prepare(a, &sites, &.{original}, 1, 3, 9, &.{ 7, 9 }, 10);
    defer a.free(spans);
    const fragment = try @import("character_style_run_xml.zig").write(a, &tree, &sites, spans, 1000);
    defer a.free(fragment);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, "<!--prefix-->"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, "<?suffix keep?>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, "<p:fieldEnd"));
    try std.testing.expect(std.mem.indexOf(u8, fragment, "<p:fieldBegin").? < std.mem.indexOf(u8, fragment, "<p:t opaque='text'>A").?);
    try std.testing.expect(std.mem.indexOf(u8, fragment, "<p:fieldEnd").? > std.mem.indexOf(u8, fragment, "<p:t opaque='text'>B").?);
    const node = tree.elements[2];
    const saved = try @import("xml_source_writer.zig").write(a, source, &.{.{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = fragment }}, 2000);
    defer a.free(saved);
    var reopened = try @import("xml_part_tree.zig").parse(a, saved, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var current = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer current.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), current.items.len);
    for (current.items, [_][]const u8{ "A", "😀", "B" }, [_][]const u8{ "7", "9", "7" }) |site, expected, id| {
        try std.testing.expectEqualStrings(expected, site.text);
        const run = reopened.elements[site.element_index].parent.?;
        const value = (try reopened.attributeValue(a, run, "", "charPrIDRef")).?;
        const decoded = try value.toUtf8(a, 10);
        defer a.free(decoded);
        try std.testing.expectEqualStrings(id, decoded);
    }
    try std.testing.expectError(error.InvalidTextSites, @import("character_style_run_xml.zig").write(a, &tree, &sites, spans[0..2], 1000));
    try std.testing.expectError(error.LimitExceeded, @import("character_style_run_xml.zig").write(a, &tree, &sites, spans, fragment.len - 1));
    const restored = try @import("character_style_paint.zig").prepare(a, &sites, spans, 0, 4, 7, &.{ 7, 9 }, 10);
    defer a.free(restored);
    const restored_xml = try @import("character_style_run_xml.zig").write(a, &tree, &sites, restored, 1000);
    defer a.free(restored_xml);
    try std.testing.expectEqualStrings(tree.sourceOf(2), restored_xml);
    var invalid = [_]Span{ spans[0], spans[1], spans[2] };
    invalid[1].start_unit = 0;
    try std.testing.expectError(error.InvalidTextSites, @import("character_style_run_xml.zig").write(a, &tree, &sites, &invalid, 1000));
    invalid[1] = spans[1];
    invalid[1].run_element = 1;
    try std.testing.expectError(error.SourceBindingMismatch, @import("character_style_run_xml.zig").write(a, &tree, &sites, &invalid, 1000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, partition: []const Span) !void {
            const result = try @import("character_style_run_xml.zig").write(allocator, t, s, partition, 1000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &sites, spans });
    try std.testing.expectEqualStrings(source, tree.source);
}

const std = @import("std");
const model = @import("../model/created_table.zig");
const writer = @import("created_table_xml.zig");

fn make(a: std.mem.Allocator) !model.Table {
    return model.create(a, 1, 33, try @import("../model/table_creation_plan.zig").create(2, 2, 101, 17, 4), &.{ 3, 5, 7, 9 }, .{ .paragraph = 2, .character = 1, .style = 0, .border_fill = 3 }, 4);
}

test "generated cell text XML rejects every short output budget and malformed scalar around LF" {
    const a = std.testing.allocator;
    const encode = @import("created_cell_text_xml.zig").encode;
    const input = "\n한😀&<>\r\n<hp:lineBreak/>\n";
    const expected = "<hp:lineBreak/>한😀&amp;&lt;&gt;&#13;<hp:lineBreak/>&lt;hp:lineBreak/&gt;<hp:lineBreak/>";
    for (0..expected.len) |limit| try std.testing.expectError(error.LimitExceeded, encode(a, input, limit));
    const exact = try encode(a, input, expected.len);
    defer a.free(exact);
    try std.testing.expectEqualStrings(expected, exact);
    const empty = try encode(a, "", 0);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    for ([_][]const u8{ "\n\x80", "A\n\xed\xa0\x80", "\xf4\x90\x80\x80\n" }) |invalid| {
        try std.testing.expectError(error.InvalidXmlEncoding, encode(a, invalid, 100));
    }
    try std.testing.expectError(error.UnexpectedEnd, encode(a, "\n\xf0\x9f", 100));
    try std.testing.expectError(error.InvalidXmlCharacter, encode(a, "\n\xef\xbf\xbe", 100));
}

test "created table XML emits semantic soft line break rather than literal LF" {
    const a = std.testing.allocator;
    var table = try make(a);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "첫😀\n\n끝<&", 100);
    const xml = try writer.write(a, &table, 10000);
    defer a.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "첫😀<hp:lineBreak/><hp:lineBreak/>끝&lt;&amp;") != null);
    try std.testing.expect(std.mem.indexOfScalar(u8, xml, '\n') == null);
    const encode = @import("created_cell_text_xml.zig").encode;
    const expected = "<hp:lineBreak/>A&amp;<hp:lineBreak/>";
    const exact = try encode(a, "\nA&\n", expected.len);
    defer a.free(exact);
    try std.testing.expectEqualStrings(expected, exact);
    try std.testing.expectError(error.LimitExceeded, encode(a, "\nA&\n", expected.len - 1));
    try std.testing.expectError(error.InvalidXmlCharacter, encode(a, "\n\x00", 100));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const value = try @import("created_cell_text_xml.zig").encode(allocator, "\nA&\n", 100);
            defer allocator.free(value);
            try std.testing.expectEqualStrings("<hp:lineBreak/>A&amp;<hp:lineBreak/>", value);
        }
    }.run, .{});
}

test "created table XML reparses exact grid IDs sizes Unicode and rejects invalid text" {
    const a = std.testing.allocator;
    var table = try make(a);
    defer table.deinit(a);
    const text = "한😀<&amp;>]]>\r\t";
    _ = try table.replaceText(a, 0, 0, text, 100);
    const xml = try writer.write(a, &table, 10000);
    defer a.free(xml);
    const source = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='99' paraPrIDRef='2' styleIDRef='0'><p:run charPrIDRef='1'>{s}</p:run></p:p></s:sec>", .{xml});
    defer a.free(source);
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const report = try @import("table_geometry.zig").inspect(a, &.{tree}, .{});
    try std.testing.expectEqual(@as(usize, 4), report.cells);
    try std.testing.expectEqual(@as(usize, 0), report.overlaps);
    try std.testing.expectEqual(@as(usize, 0), report.uncovered_slots);
    var cells: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "tc")) continue;
        const actual = try @import("table_display_cell.zig").read(a, &tree, node);
        const expected = try table.plan.cell(@intCast(cells / 2), @intCast(cells % 2));
        try std.testing.expectEqual(@as(?u32, expected.row), actual.row);
        try std.testing.expectEqual(@as(?u32, expected.column), actual.column);
        try std.testing.expectEqual(@as(?u32, expected.width), actual.width);
        try std.testing.expectEqual(@as(?u32, expected.height), actual.height);
        const fields = @import("table_xml_fields.zig");
        var missing: usize = 0;
        var duplicate: usize = 0;
        const paragraph = fields.uniqueChild(&tree, actual.sub_list.?, "p", &missing, &duplicate) orelse return error.MissingCreatedParagraph;
        try std.testing.expectEqual(@as(usize, 0), duplicate);
        try std.testing.expectEqual(@as(?u32, table.cells[cells].paragraph_id), try fields.optionalUnsigned(a, &tree, paragraph, "id", 4096));
        try std.testing.expectEqual(@as(?u32, table.resources.paragraph), try fields.optionalUnsigned(a, &tree, paragraph, "paraPrIDRef", 4096));
        try std.testing.expectEqual(@as(?u32, table.resources.style), try fields.optionalUnsigned(a, &tree, paragraph, "styleIDRef", 4096));
        const run = fields.uniqueChild(&tree, paragraph, "run", &missing, &duplicate) orelse return error.MissingCreatedRun;
        try std.testing.expectEqual(@as(usize, 0), duplicate);
        try std.testing.expectEqual(@as(?u32, table.resources.character), try fields.optionalUnsigned(a, &tree, run, "charPrIDRef", 4096));
        cells += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), cells);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var found = false;
    for (sites.items) |site| if (site.text.len != 0) {
        try std.testing.expectEqualStrings(text, site.text);
        try std.testing.expect(!found);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &table, xml.len - 1));
    _ = try table.replaceText(a, 0, 0, &.{0}, 100);
    try std.testing.expectError(error.InvalidXmlCharacter, writer.write(a, &table, 10000));
}

test "created table XML releases every allocation failure and rejects duplicate paragraph IDs" {
    const a = std.testing.allocator;
    var table = try make(a);
    defer table.deinit(a);
    _ = try table.replaceText(a, 1, 1, "끝😀<&\n\n", 100);
    const expected = try writer.write(a, &table, 10000);
    defer a.free(expected);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const model.Table, baseline: []const u8) !void {
            const xml = try writer.write(allocator, input, 10000);
            defer allocator.free(xml);
            try std.testing.expectEqualSlices(u8, baseline, xml);
        }
    }.run, .{ &table, expected });
    try std.testing.expectEqualStrings("끝😀<&\n\n", table.cells[3].text);
    table.cells[3].paragraph_id = table.cells[0].paragraph_id;
    try std.testing.expectError(error.InvalidTableParagraphIds, writer.write(a, &table, 10000));
}

const std = @import("std");
const grid = @import("source_table_grid.zig");
const a = std.testing.allocator;
const before = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run>";
const after = "</p:run></p:p></s:sec>";
const picture = "<p:pic id='77' zOrder='6' numberingType='PICTURE' textWrap='SQUARE' textFlow='BOTH_SIDES'><c:img binaryItemIDRef='image3'/><p:sz width='8649' height='45540' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE' protect='0'/><p:pos treatAsChar='0' horzOffset='6411'/><p:shapeComment>원본&amp;그림<![CDATA[<설명>]]></p:shapeComment></p:pic>";
fn fixture(allocator: std.mem.Allocator, object: []const u8, missing_id: bool) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    errdefer bytes.deinit(allocator);
    try bytes.appendSlice(allocator, before ++ "<p:tbl rowCnt='2' colCnt='3'><p:sz width='47' height='62' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>");
    for (0..2) |row| {
        try bytes.appendSlice(allocator, "<p:tr>");
        for (0..3) |column| {
            const widths = [_]u32{ 9, 18, 20 };
            const heights = [_]u32{ 2, 3, 3, 2, 1, 2 };
            // Duplicate/missing source metadata is preserved; it is not a fresh ID.
            try bytes.print(allocator, "<p:tc><p:subList id=''><p:p{s}><p:run charPrIDRef='4'><p:t>cell{d}</p:t>{s}</p:run></p:p></p:subList><p:cellAddr rowAddr='{d}' colAddr='{d}'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='{d}' height='{d}'/></p:tc>", .{ if (missing_id) "" else " id='0'", row * 3 + column, if (row == 0 and column == 1) object else "", row, column, widths[column], heights[row * 3 + column] });
        }
        try bytes.appendSlice(allocator, "</p:tr>");
    }
    try bytes.appendSlice(allocator, "</p:tbl>" ++ after);
    return bytes.toOwnedSlice(allocator);
}
fn request(source: []const u8, command: grid.Command, ids: []const u32) !grid.Request {
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    for (tree.elements, 0..) |_, i| if (@import("table_xml_fields.zig").childIs(&tree, i, "tbl")) return .{ .target = .{ .element = i }, .expected_rows = 2, .expected_columns = 3, .command = command, .fresh_paragraph_ids = ids };
    return error.TestMissingTable;
}

test "source column retained picture preserves complete subtree comment and duplicate or missing metadata" {
    for ([_]bool{ false, true }) |missing| {
        const source = try fixture(a, picture, missing);
        defer a.free(source);
        const copy = try a.dupe(u8, source);
        defer a.free(copy);
        const commands = [_]grid.Command{ .{ .insert_column = 1 }, .{ .delete_column = 0 } };
        for (commands) |command| {
            const output = try grid.prepare(a, source, try request(source, command, if (command == .insert_column) &.{ 100, 101 } else &.{}));
            defer a.free(output);
            const at = std.mem.indexOf(u8, output, picture) orelse return error.TestPictureChanged;
            try std.testing.expect(std.mem.indexOf(u8, output[at + picture.len ..], picture) == null);
            try std.testing.expect(std.mem.indexOf(u8, output, "height='62'") != null);
            try std.testing.expectEqualSlices(u8, copy, source);
        }
    }
}

test "source column retained picture refuses picture donors deleted owners and unrelated comments" {
    const source = try fixture(a, picture, false);
    defer a.free(source);
    try std.testing.expectError(error.UnsupportedSourceTableStructure, grid.prepare(a, source, try request(source, .{ .insert_column = 2 }, &.{ 100, 101 })));
    try std.testing.expectError(error.UnsupportedSourceTableStructure, grid.prepare(a, source, try request(source, .{ .delete_column = 1 }, &.{})));
    const bad = [_][]const u8{
        "<p:shapeComment>not a picture owner</p:shapeComment>",
        "<p:pic><p:shapeComment><p:unknown>nested</p:unknown></p:shapeComment></p:pic>",
        "<p:unknown>semantic text</p:unknown>",
    };
    for (bad) |body| {
        const input = try fixture(a, body, false);
        defer a.free(input);
        try std.testing.expectError(error.UnsupportedSourceTableStructure, grid.prepare(a, input, try request(input, .{ .insert_column = 1 }, &.{ 100, 101 })));
    }
}

test "source column retained picture detached failures preserve original subtree" {
    const input = try fixture(a, picture, false);
    defer a.free(input);
    const r = try request(input, .{ .insert_column = 1 }, &.{ 100, 101 });
    try @import("../testing/allocation_failures.zig").check(struct {
        fn attempt(allocator: std.mem.Allocator, source: []const u8, req: grid.Request) !void {
            const result = try grid.prepare(allocator, source, req);
            defer allocator.free(result);
            try std.testing.expect(std.mem.indexOf(u8, result, picture) != null);
        }
    }.attempt, .{ input, r });
}

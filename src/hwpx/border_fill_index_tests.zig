const std = @import("std");
const t = std.testing;
const current = @import("border_fill_source.zig");

const tables = @import("table_border_sources.zig");

const Tree = @import("xml_part_tree.zig").Tree;
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:borderFills>";
const suffix = "</h:borderFills></h:refList></h:head>";
fn header(a: std.mem.Allocator, body: []const u8) !Tree {
    const xml = try std.mem.concat(a, u8, &.{ prefix, body, suffix });
    defer a.free(xml);
    return @import("header_tree.zig").parse(a, xml, 0, .{});
}
fn compare(a: std.mem.Allocator, tree: *const Tree, index: *current.Index, id: u32) !void {
    var expected = current.read(a, tree, id) catch |err| {
        try t.expectError(err, current.readWithIndex(a, tree, id, index));
        return;
    };
    defer expected.deinit();
    var actual = try current.readWithIndex(a, tree, id, index);
    defer actual.deinit();
    const left = try std.json.Stringify.valueAlloc(a, expected, .{});
    defer a.free(left);
    const right = try std.json.Stringify.valueAlloc(a, actual, .{});
    defer a.free(right);
    try t.expectEqualSlices(u8, left, right);
}
const valid = "<h:borderFill id='300'><h:leftBorder type='SOLID' width='0.1 mm' color='#123456'/></h:borderFill>" ++
    "<h:borderFill id='0'/><h:unknown/><h:borderFill id='9' threeD='0'><h:unknown/></h:borderFill>";
test "border index sparse unordered zero and missing IDs preserve every Source JSON byte" {
    const a = t.allocator;
    var tree = try header(a, valid);
    defer tree.deinit(a);
    var index = current.Index.init(a, &tree);
    defer index.deinit();
    for ([_]u32{ 300, 0, 9, 1, 8, 301, 0xffffffff, 300, 9, 0 }) |id| try compare(a, &tree, &index, id);
    var no_zero = try header(a, "<h:borderFill id='9'/>");
    defer no_zero.deinit(a);
    var missing = current.Index.init(a, &no_zero);
    defer missing.deinit();
    try compare(a, &no_zero, &missing, 0);
}
test "border index malformed numeric ID and requested duplicate priority match original source order" {
    const a = t.allocator;
    const cases = [_][]const u8{
        "<h:borderFill id='1'/><h:borderFill id='2'/><h:borderFill id='2'/>",
        "<h:borderFill id='1'/><h:borderFill id='1'/><h:borderFill id='bad'/>",
        "<h:borderFill id='bad'/><h:borderFill id='1'/><h:borderFill id='1'/>",
        "<h:borderFill id='1'/><h:borderFill/><h:borderFill id='1'/>",
        "<h:borderFill id='1'/><h:borderFill id='1'/><h:borderFill/>",
        "<h:borderFill id='-1'/>",
        "<h:borderFill id='4294967296'/>",
    };
    for (cases) |body| {
        var tree = try header(a, body);
        defer tree.deinit(a);
        var index = current.Index.init(a, &tree);
        defer index.deinit();
        // A query may stop at its requested duplicate, then a later query must
        // resume validation without changing that earlier duplicate's priority.
        for ([_]u32{ 1, 2, 0, 3, 1, 2 }) |id| try compare(a, &tree, &index, id);
    }
}
test "border index header container validation precedes IDs and index binding is explicit" {
    const a = t.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:borderFills><h:borderFill id='bad'/></h:borderFills><h:borderFills/></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    var index = current.Index.init(a, &tree);
    defer index.deinit();
    try t.expectError(error.DuplicateBorderFills, current.readWithIndex(a, &tree, 1, &index));
    var other = try header(a, valid);
    defer other.deinit(a);
    try t.expectError(error.SourceBindingMismatch, current.readWithIndex(a, &other, 300, &index));
}
fn section(a: std.mem.Allocator, cell_xml: []const u8) !Tree {
    const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:tbl><p:tr>", cell_xml, "</p:tr></p:tbl></p:run></p:p></s:sec>" });
    defer a.free(xml);
    return @import("section_tree.zig").parse(a, xml, 0, 0, .{});
}
const cells = "<p:tc borderFillIDRef='0'><p:subList/></p:tc><p:tc borderFillIDRef='9'><p:subList/></p:tc><p:tc borderFillIDRef='0'><p:subList/></p:tc>";
fn reportKnown(a: std.mem.Allocator, part: *const Tree, head: *const Tree) !void {
    var result = try tables.readTrees(a, part, head);
    defer result.deinit(a);
    try t.expectEqual(@as(usize, 3), result.cells.len);
    try t.expectEqual(@as(usize, 2), result.styles.len);
    for (result.cells, [_]u32{ 0, 9, 0 }, [_]usize{ 0, 1, 0 }) |cell, id, style| {
        try t.expectEqual(@as(?u32, id), cell.border_fill_id);
        try t.expectEqual(@as(?usize, style), cell.style_index);
        try t.expect(part.elements[cell.table_node].is(@import("document_xml.zig").paragraph_uri, "tbl"));
        try t.expectEqual(@as(?usize, cell.cell_node), part.elements[cell.list_node].parent);
        try t.expectEqual(@as(?usize, cell.table_node), part.elements[part.elements[cell.cell_node].parent.?].parent);
    }
    try t.expectEqual(@as(u32, 0), result.styles[0].id);
    try t.expectEqual(@as(u32, 9), result.styles[1].id);
    try t.expectEqual(@as(?[]const u8, null), result.styles[0].three_d);
    try t.expectEqualStrings("0", result.styles[1].three_d.?);
    try t.expectEqual(@as(usize, 0), result.styles[0].unknown_children);
    try t.expectEqual(@as(usize, 1), result.styles[1].unknown_children);
    for (result.styles) |style| for (style.edges) |edge| try t.expect(edge == null);
}
test "border index readTrees is lazy for no-ID cells and retains cell error priority and style order" {
    const a = t.allocator;
    var head = try header(a, valid);
    defer head.deinit(a);
    var part = try section(a, cells);
    defer part.deinit(a);
    try reportKnown(a, &part, &head);
    var no_id = try section(a, "<p:tc><p:subList/></p:tc>");
    defer no_id.deinit(a);
    // A section tree is deliberately not a valid header. No-ID cells must
    // never validate or prepare an index/header even in this case.
    var result = try tables.readTrees(a, &no_id, &no_id);
    defer result.deinit(a);
    try t.expectEqual(@as(usize, 0), result.styles.len);
    var invalid = try section(a, "<p:tc borderFillIDRef='0'/>");
    defer invalid.deinit(a);
    try t.expectError(error.InvalidTableBorderCell, tables.readTrees(a, &invalid, &no_id));
}
fn oom(a: std.mem.Allocator, part: *const Tree, head: *const Tree) !void {
    var result = try tables.readTrees(a, part, head);
    defer result.deinit(a);
    try t.expectEqual(@as(usize, 3), result.cells.len);
    try t.expectEqual(@as(usize, 2), result.styles.len);
    try t.expectEqual(@as(?usize, 0), result.cells[0].style_index);
    try t.expectEqual(@as(?usize, 1), result.cells[1].style_index);
    try t.expectEqual(@as(?usize, 0), result.cells[2].style_index);
}
test "border index complete OOM sweep releases partial index and owned DTO without changing source" {
    const a = t.allocator;
    var head = try header(a, valid);
    defer head.deinit(a);
    var part = try section(a, cells);
    defer part.deinit(a);
    const before_head = try a.dupe(u8, head.source);
    defer a.free(before_head);
    const before_part = try a.dupe(u8, part.source);
    defer a.free(before_part);
    {
        const callback = oom;
        var counter = t.FailingAllocator.init(a, .{});
        var no_resize: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
        try callback(no_resize.allocator(), &part, &head);
        if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
        try @import("../testing/allocation_failures.zig").check(callback, .{ &part, &head });
    }
    try t.expectEqualSlices(u8, before_head, head.source);
    try t.expectEqualSlices(u8, before_part, part.source);
}

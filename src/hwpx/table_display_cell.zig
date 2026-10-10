//! Read-only scalar cell projection. Missing values are not fabricated zeros.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");

pub const Cell = struct {
    row: ?u32,
    column: ?u32,
    row_span: ?u32,
    column_span: ?u32,
    width: ?u32,
    height: ?u32,
    sub_list: ?usize,
};

fn child(tree: *const Tree, index: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const result = fields.uniqueChild(tree, index, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateCellDisplayChild;
    return result;
}

fn pair(a: std.mem.Allocator, tree: *const Tree, index: ?usize, names: [2][]const u8) ![2]?u32 {
    return if (index) |node| try fields.optionalUnsignedPair(a, tree, node, names, 4096) else .{ null, null };
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, index: usize) !Cell {
    if (index >= tree.elements.len or !fields.childIs(tree, index, "tc")) return error.InvalidCellDisplayNode;
    const address = try child(tree, index, fields.cell_child_names[0]);
    const span = try child(tree, index, fields.cell_child_names[1]);
    const size = try child(tree, index, fields.cell_child_names[2]);
    const address_values = try pair(a, tree, address, .{ "rowAddr", "colAddr" });
    const span_values = try pair(a, tree, span, .{ "rowSpan", "colSpan" });
    const size_values = try pair(a, tree, size, .{ "width", "height" });
    return .{
        .row = address_values[0],
        .column = address_values[1],
        .row_span = span_values[0],
        .column_span = span_values[1],
        .width = size_values[0],
        .height = size_values[1],
        .sub_list = try child(tree, index, fields.cell_child_names[4]),
    };
}

fn allocationCase(a: std.mem.Allocator) !void {
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:tc><p:cellAddr rowAddr='&#49;' colAddr='0'/><p:cellSpan rowSpan='0' colSpan='2'/><p:cellSz width='0'/><x:cellSz height='123'/><p:subList/></p:tc></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    const cell = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?u32, 1), cell.row);
    try std.testing.expectEqual(@as(?u32, 0), cell.column);
    try std.testing.expectEqual(@as(?u32, 0), cell.row_span);
    try std.testing.expectEqual(@as(?u32, 2), cell.column_span);
    try std.testing.expectEqual(@as(?u32, 0), cell.width);
    try std.testing.expectEqual(@as(?u32, null), cell.height);
    try std.testing.expect(cell.sub_list != null);
    try std.testing.expectError(error.InvalidCellDisplayNode, read(a, &tree, 0));
}

test "HWPX display cell preserves absent zero entity namespace and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX display cell refuses duplicate direct children" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tc><p:cellAddr/><p:cellAddr/></p:tc></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.DuplicateCellDisplayChild, read(a, &tree, 1));
}

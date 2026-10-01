//! Source-tree cell ownership; current values and grid validation are separate.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const fields = @import("table_xml_fields.zig");

pub const Owner = struct {
    table: usize,
    cell: usize,
    origin: @import("../hwp5/body/formula_range.zig").Cell,
    columns: u32,
    rows: u32,
};

pub fn read(a: std.mem.Allocator, tree: *const tree_mod.Tree, marker: usize) !Owner {
    if (marker >= tree.elements.len or !fields.childIs(tree, marker, "fieldBegin")) return error.InvalidFormulaMarker;
    var cursor = tree.elements[marker].parent;
    var cell: ?usize = null;
    while (cursor) |index| : (cursor = tree.elements[index].parent) {
        if (fields.childIs(tree, index, "tc")) {
            cell = index;
            break;
        }
    }
    const cell_index = cell orelse return error.FormulaOutsideTableCell;
    const row = tree.elements[cell_index].parent orelse return error.InvalidFormulaCellOwner;
    if (!fields.childIs(tree, row, "tr")) return error.InvalidFormulaCellOwner;
    const table = tree.elements[row].parent orelse return error.InvalidFormulaCellOwner;
    if (!fields.childIs(tree, table, "tbl")) return error.InvalidFormulaCellOwner;
    var missing: usize = 0;
    var duplicate: usize = 0;
    const address = fields.uniqueChild(tree, cell_index, "cellAddr", &missing, &duplicate) orelse return error.InvalidFormulaCellAddress;
    const column = try fields.optionalUnsigned(a, tree, address, "colAddr", 4096) orelse return error.InvalidFormulaCellAddress;
    const row_index = try fields.optionalUnsigned(a, tree, address, "rowAddr", 4096) orelse return error.InvalidFormulaCellAddress;
    const columns = try fields.optionalUnsigned(a, tree, table, "colCnt", 4096) orelse return error.InvalidFormulaTableSize;
    const rows = try fields.optionalUnsigned(a, tree, table, "rowCnt", 4096) orelse return error.InvalidFormulaTableSize;
    if (column >= columns or row_index >= rows) return error.FormulaCellOutsideGrid;
    return .{ .table = table, .cell = cell_index, .origin = .{ .column = column, .row = row_index }, .columns = columns, .rows = rows };
}

test "HWPX formula cell owner rejects duplicate addresses and outside coordinates" {
    const a = std.testing.allocator;
    const addresses = [_][]const u8{
        "<p:cellAddr colAddr='0' rowAddr='0'/>",
        "<p:cellAddr colAddr='0' rowAddr='0'/><p:cellAddr colAddr='0' rowAddr='0'/>",
        "<p:cellAddr colAddr='1' rowAddr='0'/>",
    };
    for (addresses, 0..) |address, case| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl colCnt='1' rowCnt='1'><p:tr><p:tc>", address, "<p:subList><p:p><p:run><p:ctrl><p:fieldBegin/></p:ctrl></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>" });
        defer a.free(source);
        var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var marker: usize = 0;
        for (tree.elements, 0..) |_, index| if (fields.childIs(&tree, index, "fieldBegin")) {
            marker = index;
        };
        switch (case) {
            0 => {
                const owner = try read(a, &tree, marker);
                try std.testing.expectEqual(@as(u32, 0), owner.origin.column);
            },
            1 => try std.testing.expectError(error.InvalidFormulaCellAddress, read(a, &tree, marker)),
            2 => try std.testing.expectError(error.FormulaCellOutsideGrid, read(a, &tree, marker)),
            else => unreachable,
        }
        try std.testing.expectError(error.InvalidFormulaMarker, read(a, &tree, tree.elements.len));
    }
}

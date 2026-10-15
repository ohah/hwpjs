//! Validated source grid rectangles; no cached numeric values.
const std = @import("std");
const fields = @import("table_xml_fields.zig");
pub const Rectangle = struct {
    column: u32,
    row: u32,
    columns: u32,
    rows: u32,
    pub fn contains(self: Rectangle, column: u32, row: u32) bool {
        return column >= self.column and row >= self.row and column - self.column < self.columns and row - self.row < self.rows;
    }
    pub fn merged(self: Rectangle) bool {
        return self.columns != 1 or self.rows != 1;
    }
    pub fn overlaps(self: Rectangle, other: Rectangle) bool {
        if (self.columns == 0 or self.rows == 0 or other.columns == 0 or other.rows == 0) return false;
        const columns = if (self.column <= other.column) other.column - self.column < self.columns else self.column - other.column < other.columns;
        const rows = if (self.row <= other.row) other.row - self.row < self.rows else self.row - other.row < other.rows;
        return columns and rows;
    }
};
pub fn read(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, cell: usize, columns: u32, rows: u32) !Rectangle {
    if (cell >= tree.elements.len or !fields.childIs(tree, cell, "tc")) return error.InvalidFormulaCellAddress;
    var missing: usize = 0;
    var duplicate: usize = 0;
    const address = fields.uniqueChild(tree, cell, "cellAddr", &missing, &duplicate) orelse return error.InvalidFormulaCellAddress;
    const span = fields.uniqueChild(tree, cell, "cellSpan", &missing, &duplicate) orelse return error.InvalidFormulaCellSpan;
    var raw: [2]?@import("../xml/attribute_value.zig").Value = undefined;
    try tree.unprefixedAttributeValues(a, address, &.{ "colAddr", "rowAddr" }, &raw);
    // Convert in the original order: a missing first field must win over a
    // malformed second field. The returned values borrow the source tree.
    const c = try fields.unsigned(a, raw[0] orelse return error.InvalidFormulaCellAddress, 4096);
    const r = try fields.unsigned(a, raw[1] orelse return error.InvalidFormulaCellAddress, 4096);
    try tree.unprefixedAttributeValues(a, span, &.{ "colSpan", "rowSpan" }, &raw);
    const cs = try fields.unsigned(a, raw[0] orelse return error.InvalidFormulaCellSpan, 4096);
    const rs = try fields.unsigned(a, raw[1] orelse return error.InvalidFormulaCellSpan, 4096);
    if (cs == 0 or rs == 0 or c >= columns or r >= rows or cs > columns - c or rs > rows - r) return error.InvalidFormulaCellSpan;
    return .{ .column = c, .row = r, .columns = cs, .rows = rs };
}

test "formula cell rectangles match independent occupied masks without overflow" {
    const mask = struct {
        fn of(rectangle: Rectangle) u64 {
            var value: u64 = 0;
            for (0..rectangle.rows) |r| for (0..rectangle.columns) |c| {
                const bit: u6 = @intCast((rectangle.row + r) * 8 + rectangle.column + c);
                value |= @as(u64, 1) << bit;
            };
            return value;
        }
    }.of;
    for (0..5) |r| for (0..5) |c| for (0..4) |rows| for (0..4) |columns| {
        const left: Rectangle = .{ .column = @intCast(c), .row = @intCast(r), .columns = @intCast(columns), .rows = @intCast(rows) };
        for (0..5) |r2| for (0..5) |c2| for (0..4) |rows2| for (0..4) |columns2| {
            const right: Rectangle = .{ .column = @intCast(c2), .row = @intCast(r2), .columns = @intCast(columns2), .rows = @intCast(rows2) };
            try std.testing.expectEqual(mask(left) & mask(right) != 0, left.overlaps(right));
        };
    };
    const edge: Rectangle = .{ .column = std.math.maxInt(u32) - 1, .row = std.math.maxInt(u32) - 1, .columns = 2, .rows = 2 };
    const last: Rectangle = .{ .column = std.math.maxInt(u32), .row = std.math.maxInt(u32), .columns = 1, .rows = 1 };
    try std.testing.expect(edge.contains(last.column, last.row));
    try std.testing.expect(edge.overlaps(last));
    try std.testing.expect(last.overlaps(edge));
}

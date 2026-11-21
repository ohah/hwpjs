//! Routing helper for OWN native session tests, not a mutation authority issuer.
const std = @import("std");
const block = @import("../model/original_cell_block.zig");
pub const Row = struct { paragraph: u32, table: usize, list: u32, rows: u32, columns: u32, row: u32, column: u32, row_span: u32, column_span: u32 };
pub const Capture = struct {
    table: usize,
    selection: block.Selection,
    pub fn deinit(self: Capture, a: std.mem.Allocator) void {
        for (self.selection.cells) |cell| a.free(cell.paragraphs);
        a.free(self.selection.cells);
    }
};
fn collect(a: std.mem.Allocator, rows: []const Row, rectangle: block.Rectangle) !Capture {
    if (rows.len == 0) return error.MissingOwnFixtureCells;
    var result: std.ArrayList(block.Witness) = .empty;
    errdefer {
        for (result.items) |cell| a.free(cell.paragraphs);
        result.deinit(a);
    }
    var positions: std.AutoHashMap(u32, usize) = .init(a);
    defer positions.deinit();
    for (rows) |row| {
        if (row.table != rows[0].table or row.row >= rectangle.bottom or row.column >= rectangle.right or row.row + row.row_span <= rectangle.top or row.column + row.column_span <= rectangle.left) continue;
        if (positions.get(row.list)) |index| {
            const old = result.items[index].paragraphs;
            const next = try a.alloc(u32, old.len + 1);
            @memcpy(next[0..old.len], old);
            next[old.len] = row.paragraph;
            a.free(old);
            result.items[index].paragraphs = next;
        } else {
            const paragraphs = try a.dupe(u32, &.{row.paragraph});
            errdefer a.free(paragraphs);
            try positions.put(row.list, result.items.len);
            try result.append(a, .{ .list_node = row.list, .row = row.row, .column = row.column, .paragraphs = paragraphs });
        }
    }
    return .{ .table = rows[0].table, .selection = .{ .rows = rows[0].rows, .columns = rows[0].columns, .rectangle = rectangle, .cells = try result.toOwnedSlice(a) } };
}
pub const top: block.Rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 2 };
pub fn h5(a: std.mem.Allocator, session: anytype) !Capture {
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    const rows = try a.alloc(Row, bindings.len);
    defer a.free(rows);
    for (bindings, rows) |binding, *row| row.* = .{ .paragraph = binding.paragraph, .table = binding.table_node, .list = binding.list_node, .rows = binding.rows, .columns = binding.columns, .row = binding.row, .column = binding.column, .row_span = binding.row_span, .column_span = binding.column_span };
    return collect(a, rows, top);
}
pub fn hx(a: std.mem.Allocator, session: anytype) !Capture {
    const bindings = try @import("../hwpx/table_display_bindings.zig").read(a, session, 0);
    defer a.free(bindings);
    const rows = try a.alloc(Row, bindings.len);
    defer a.free(rows);
    for (bindings, rows) |binding, *row| {
        if (binding.paragraph > std.math.maxInt(u32) or binding.owner.list_node > std.math.maxInt(u32)) return error.LimitExceeded;
        row.* = .{ .paragraph = @intCast(binding.paragraph), .table = binding.owner.table_node, .list = @intCast(binding.owner.list_node), .rows = binding.owner.rows, .columns = binding.owner.columns, .row = binding.owner.cell.row.?, .column = binding.owner.cell.column.?, .row_span = binding.owner.cell.row_span.?, .column_span = binding.owner.cell.column_span.? };
    }
    return collect(a, rows, top);
}

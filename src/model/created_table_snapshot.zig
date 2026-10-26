//! Detached format-neutral geometry/text; caller supplies its host index convention.
const std = @import("std");
pub const Cell = struct { paragraph_id: u32, row: u32, column: u32, x: u32, y: u32, width: u32, height: u32, text: []u8 };
pub const Row = struct {
    identity: []u8,
    instance_id: u32,
    host_paragraph: usize,
    anchor_unit: u32,
    rows: u32,
    columns: u32,
    width: u32,
    height: u32,
    resources: @import("created_table.zig").Resources,
    cells: []Cell,
    pub fn deinit(self: *Row, a: std.mem.Allocator) void {
        for (self.cells) |cell| a.free(cell.text);
        a.free(self.cells);
        a.free(self.identity);
        self.* = undefined;
    }
};
pub fn deinit(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |*row| row.deinit(a);
    a.free(rows);
}
pub fn fromTable(a: std.mem.Allocator, table: *const @import("created_table.zig").Table, host: usize, unit: u32) !Row {
    const height = try table.plan.height();
    if (table.cells.len != try std.math.mul(usize, table.plan.rows, table.plan.columns)) return error.InvalidTableParagraphIds;
    const identity = try std.fmt.allocPrint(a, "{d}", .{table.identity});
    errdefer a.free(identity);
    const cells = try a.alloc(Cell, table.cells.len);
    var copied: usize = 0;
    errdefer {
        for (cells[0..copied]) |cell| a.free(cell.text);
        a.free(cells);
    }
    for (table.cells, cells, 0..) |source, *cell, index| {
        const geometry = try table.plan.cell(@intCast(index / table.plan.columns), @intCast(index % table.plan.columns));
        cell.* = .{ .paragraph_id = source.paragraph_id, .row = geometry.row, .column = geometry.column, .x = geometry.x, .y = geometry.y, .width = geometry.width, .height = geometry.height, .text = try a.dupe(u8, source.text) };
        copied += 1;
    }
    return .{ .identity = identity, .instance_id = table.instance_id, .host_paragraph = host, .anchor_unit = unit, .rows = table.plan.rows, .columns = table.plan.columns, .width = table.plan.width, .height = height, .resources = table.resources, .cells = cells };
}

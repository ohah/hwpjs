//! Detached created-object query; identities never pretend to be XML nodes.
const std = @import("std");
const editor = @import("editor_session.zig");
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
    resources: @import("../model/created_table.zig").Resources,
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
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const entries = session.sections[section_index].created_tables.entries.items;
    const rows = try a.alloc(Row, entries.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (entries, rows) |entry, *row| {
        const point = try @import("created_table_anchor.zig").resolve(a, session, entry.anchor);
        const identity = try std.fmt.allocPrint(a, "{d}", .{entry.table.identity});
        errdefer a.free(identity);
        const cells = try a.alloc(Cell, entry.table.cells.len);
        var copied: usize = 0;
        errdefer {
            for (cells[0..copied]) |cell| a.free(cell.text);
            a.free(cells);
        }
        if (cells.len != try std.math.mul(usize, entry.table.plan.rows, entry.table.plan.columns)) return error.InvalidTableParagraphIds;
        for (entry.table.cells, cells, 0..) |source, *cell, index| {
            const geometry = try entry.table.plan.cell(@intCast(index / entry.table.plan.columns), @intCast(index % entry.table.plan.columns));
            cell.* = .{ .paragraph_id = source.paragraph_id, .row = geometry.row, .column = geometry.column, .x = geometry.x, .y = geometry.y, .width = geometry.width, .height = geometry.height, .text = try a.dupe(u8, source.text) };
            copied += 1;
        }
        row.* = .{ .identity = identity, .instance_id = entry.table.instance_id, .host_paragraph = point.paragraph, .anchor_unit = point.unit, .rows = entry.table.plan.rows, .columns = entry.table.plan.columns, .width = entry.table.plan.width, .height = try entry.table.plan.height(), .resources = entry.table.resources, .cells = cells };
        initialized += 1;
    }
    return rows;
}

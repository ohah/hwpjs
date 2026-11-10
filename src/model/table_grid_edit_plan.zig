//! Coordinate-only grid edit policy shared by generated and source tables.
//! Wire formats, cell payloads, geometry and fresh IDs remain with callers.
const std = @import("std");
pub const Command = union(enum) { insert_row: u32, delete_row: u32, insert_column: u32, delete_column: u32 };
pub const Plan = struct {
    old_rows: u32,
    old_columns: u32,
    rows: u32,
    columns: u32,
    inserted_count: usize,
    index: u32,
    row_edit: bool,
    insertion: bool,

    /// Null identifies a newly inserted cell. No cell payload is copied here.
    pub fn sourceIndex(self: Plan, row: u32, column: u32) !?usize {
        if (row >= self.rows or column >= self.columns) return error.InvalidTableCell;
        const coordinate = if (self.row_edit) row else column;
        if (self.insertion and coordinate == self.index) return null;
        const prior = if (self.insertion) coordinate - @intFromBool(coordinate > self.index) else coordinate + @intFromBool(coordinate >= self.index);
        return if (self.row_edit) @as(usize, prior) * self.old_columns + column else @as(usize, row) * self.old_columns + prior;
    }

    /// New cells inherit the preceding row/column, or the first at index zero.
    /// Callers select which formatting fields may safely be inherited.
    pub fn templateIndex(self: Plan, row: u32, column: u32) !usize {
        if (try self.sourceIndex(row, column)) |index| return index;
        const adjacent = self.index - @intFromBool(self.index != 0);
        return if (self.row_edit) @as(usize, adjacent) * self.old_columns + column else @as(usize, row) * self.old_columns + adjacent;
    }
};

pub fn create(rows: u32, columns: u32, command: Command, max_cells: usize) !Plan {
    if (max_cells == 0) return error.InvalidTableGridLimits;
    if (rows == 0 or columns == 0) return error.InvalidTableGridEdit;
    if (try std.math.mul(usize, rows, columns) > max_cells) return error.LimitExceeded;
    const row_edit = switch (command) {
        .insert_row, .delete_row => true,
        else => false,
    };
    const insertion = switch (command) {
        .insert_row, .insert_column => true,
        else => false,
    };
    const index = switch (command) {
        inline else => |value| value,
    };
    const dimension = if (row_edit) rows else columns;
    if (index > dimension or (!insertion and (index == dimension or dimension == 1))) return error.InvalidTableGridEdit;
    const next = if (insertion) try std.math.add(u32, dimension, 1) else dimension - 1;
    const target_rows = if (row_edit) next else rows;
    const target_columns = if (row_edit) columns else next;
    if (try std.math.mul(usize, target_rows, target_columns) > max_cells) return error.LimitExceeded;
    return .{ .old_rows = rows, .old_columns = columns, .rows = target_rows, .columns = target_columns, .inserted_count = if (!insertion) 0 else if (row_edit) columns else rows, .index = index, .row_edit = row_edit, .insertion = insertion };
}

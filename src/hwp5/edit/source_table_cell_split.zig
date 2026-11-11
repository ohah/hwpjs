//! Coordinate-only refinement for one unmerged source cell. Ownership and source
//! eligibility stay in source_table_grid; no control payload is decoded here.
const std = @import("std");
pub const Request = struct { row: u32, column: u32, rows: u32, columns: u32 };
pub const Plan = struct {
    old_rows: u32,
    old_columns: u32,
    rows: u32,
    columns: u32,
    inserted_count: usize,
    split: Request,

    pub fn templateIndex(self: Plan, row: u32, column: u32) !usize {
        if (row >= self.rows or column >= self.columns) return error.InvalidTableCell;
        const old_row = prior(row, self.split.row, self.split.rows);
        const old_column = prior(column, self.split.column, self.split.columns);
        return @as(usize, old_row) * self.old_columns + old_column;
    }
    pub fn sourceIndex(self: Plan, row: u32, column: u32) !?usize {
        const index = try self.templateIndex(row, column);
        if (index == @as(usize, self.split.row) * self.old_columns + self.split.column and
            (row != self.split.row or column != self.split.column)) return null;
        return index;
    }
    pub fn starts(self: Plan, row: u32, column: u32) bool {
        const in_row = row >= self.split.row and row < self.split.row + self.split.rows;
        const in_column = column >= self.split.column and column < self.split.column + self.split.columns;
        if (in_row and in_column) return true;
        return (!in_row or row == self.split.row) and (!in_column or column == self.split.column);
    }
    pub fn rowCells(self: Plan, row: u32) u32 {
        if (row == self.split.row) return self.old_columns - 1 + self.split.columns;
        if (row > self.split.row and row < self.split.row + self.split.rows) return self.split.columns;
        return self.old_columns;
    }
    pub fn selected(self: Plan, row: u32, column: u32) bool {
        return row >= self.split.row and row < self.split.row + self.split.rows and
            column >= self.split.column and column < self.split.column + self.split.columns;
    }
    pub fn rowSpan(self: Plan, row: u32, column: u32) u32 {
        return if (row == self.split.row and !self.selected(row, column)) self.split.rows else 1;
    }
    pub fn columnSpan(self: Plan, row: u32, column: u32) u32 {
        return if (column == self.split.column and !self.selected(row, column)) self.split.columns else 1;
    }
};
fn prior(position: u32, selected: u32, count: u32) u32 {
    if (position < selected) return position;
    if (position < selected + count) return selected;
    return position - (count - 1);
}
pub fn part(total: u32, count: u32, index: u32) !u32 {
    if (total < count) return error.UnsupportedSourceTableSplitDimensions;
    return total / count + @intFromBool(index < total % count);
}
pub fn create(rows: u32, columns: u32, request: Request, max_cells: usize) !Plan {
    if (rows == 0 or columns == 0 or request.row >= rows or request.column >= columns or
        request.rows == 0 or request.columns == 0 or request.rows > 63 or request.columns > 63 or
        (request.rows == 1 and request.columns == 1)) return error.InvalidSourceTableCellSplit;
    const next_rows = try std.math.add(u32, rows, request.rows - 1);
    const next_columns = try std.math.add(u32, columns, request.columns - 1);
    if (try std.math.mul(usize, next_rows, next_columns) > max_cells or next_rows > 65535 or next_columns > 65535)
        return error.LimitExceeded;
    return .{ .old_rows = rows, .old_columns = columns, .rows = next_rows, .columns = next_columns, .inserted_count = @as(usize, request.rows) * request.columns - 1, .split = request };
}

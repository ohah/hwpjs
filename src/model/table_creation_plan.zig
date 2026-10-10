//! Format-neutral new-table dimensions, not source-table validation.
const std = @import("std");

pub const Cell = struct { row: u32, column: u32, x: u32, y: u32, width: u32, height: u32 };
pub const Plan = struct {
    rows: u32,
    columns: u32,
    width: u32,
    row_height: u32,

    pub fn height(self: Plan) !u32 {
        if (self.rows == 0 or self.columns == 0 or self.width < self.columns or self.row_height == 0) return error.InvalidTableCreation;
        return std.math.mul(u32, self.rows, self.row_height) catch error.InvalidTableCreation;
    }

    pub fn cell(self: Plan, row: u32, column: u32) !Cell {
        if (self.rows == 0 or self.columns == 0 or self.width < self.columns or self.row_height == 0) return error.InvalidTableCreation;
        _ = try self.height();
        if (row >= self.rows or column >= self.columns) return error.InvalidTableCell;
        const base = self.width / self.columns;
        const remainder = self.width % self.columns;
        return .{
            .row = row,
            .column = column,
            .x = try std.math.add(u32, try std.math.mul(u32, column, base), @min(column, remainder)),
            .y = try std.math.mul(u32, row, self.row_height),
            .width = base + @as(u32, @intFromBool(column < remainder)),
            .height = self.row_height,
        };
    }
};

/// Creation policy: positive cells, exact width sum, bounded cell inventory.
/// No guessed document styles, instance IDs, XML, or original node identities.
pub fn create(rows: u32, columns: u32, width: u32, row_height: u32, max_cells: usize) !Plan {
    if (rows == 0 or columns == 0 or width < columns or row_height == 0) return error.InvalidTableCreation;
    const count = std.math.mul(u64, rows, columns) catch return error.LimitExceeded;
    if (count > max_cells) return error.LimitExceeded;
    const plan: Plan = .{ .rows = rows, .columns = columns, .width = width, .row_height = row_height };
    _ = try plan.height();
    return plan;
}

test "table creation plan partitions exact positive widths against independent assignment" {
    for (1..33) |columns| {
        for (0..columns + 1) |extra| {
            const width: u32 = @intCast(columns * 3 + extra);
            const plan = try create(3, @intCast(columns), width, 7, 1000);
            var expected: [32]u32 = @splat(0);
            for (0..width) |unit| expected[unit % columns] += 1;
            var y: u32 = 0;
            for (0..3) |row| {
                var x: u32 = 0;
                for (0..columns) |column| {
                    const cell = try plan.cell(@intCast(row), @intCast(column));
                    try std.testing.expectEqual(@as(u32, @intCast(row)), cell.row);
                    try std.testing.expectEqual(@as(u32, @intCast(column)), cell.column);
                    try std.testing.expectEqual(expected[column], cell.width);
                    try std.testing.expectEqual(x, cell.x);
                    try std.testing.expectEqual(y, cell.y);
                    try std.testing.expectEqual(@as(u32, 7), cell.height);
                    x += cell.width;
                }
                try std.testing.expectEqual(width, x);
                y += 7;
            }
            try std.testing.expectEqual(@as(u32, 21), try plan.height());
        }
    }
}

test "table creation plan refuses zero dimensions budgets overflow and invalid cells" {
    try std.testing.expectError(error.InvalidTableCreation, create(0, 1, 1, 1, 1));
    try std.testing.expectError(error.InvalidTableCreation, create(1, 0, 1, 1, 1));
    try std.testing.expectError(error.InvalidTableCreation, create(1, 2, 1, 1, 2));
    try std.testing.expectError(error.InvalidTableCreation, create(1, 1, 1, 0, 1));
    try std.testing.expectError(error.LimitExceeded, create(1, 1, 1, 1, 0));
    try std.testing.expectError(error.LimitExceeded, create(100, 100, 100, 1, 9999));
    try std.testing.expectError(error.InvalidTableCreation, create(2, 1, 1, std.math.maxInt(u32), 2));
    const plan = try create(1, 1, std.math.maxInt(u32), std.math.maxInt(u32), 1);
    try std.testing.expectEqual(std.math.maxInt(u32), (try plan.cell(0, 0)).width);
    try std.testing.expectError(error.InvalidTableCell, plan.cell(1, 0));
    try std.testing.expectError(error.InvalidTableCell, plan.cell(0, 1));
    const forged: Plan = .{ .rows = 1, .columns = 0, .width = 1, .row_height = 1 };
    try std.testing.expectError(error.InvalidTableCreation, forged.cell(0, 0));
    try std.testing.expectError(error.InvalidTableCreation, forged.height());
}

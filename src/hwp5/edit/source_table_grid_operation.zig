//! H5-only operation adapter. Existing grid edits retain their original mapping.
const grid = @import("../../model/table_grid_edit_plan.zig");
const split = @import("source_table_cell_split.zig");
pub const Plan = struct {
    rows: u32,
    columns: u32,
    inserted_count: usize,
    operation: union(enum) { grid: grid.Plan, split: split.Plan },
    pub fn templateIndex(self: Plan, row: u32, column: u32) !usize {
        return switch (self.operation) {
            inline else => |plan| plan.templateIndex(row, column),
        };
    }
    pub fn sourceIndex(self: Plan, row: u32, column: u32) !?usize {
        return switch (self.operation) {
            inline else => |plan| plan.sourceIndex(row, column),
        };
    }
    pub fn starts(self: Plan, row: u32, column: u32) bool {
        return switch (self.operation) {
            .grid => true,
            .split => |plan| plan.starts(row, column),
        };
    }
    pub fn rowCells(self: Plan, row: u32) u32 {
        return switch (self.operation) {
            .grid => self.columns,
            .split => |plan| plan.rowCells(row),
        };
    }
};
pub fn create(rows: u32, columns: u32, command: ?grid.Command, division: ?split.Request, max_cells: usize) !Plan {
    if ((command == null) == (division == null)) return error.InvalidSourceTableGridOperation;
    if (division) |request| {
        const plan = try split.create(rows, columns, request, max_cells);
        return .{ .rows = plan.rows, .columns = plan.columns, .inserted_count = plan.inserted_count, .operation = .{ .split = plan } };
    }
    const plan = try grid.create(rows, columns, command.?, max_cells);
    return .{ .rows = plan.rows, .columns = plan.columns, .inserted_count = plan.inserted_count, .operation = .{ .grid = plan } };
}

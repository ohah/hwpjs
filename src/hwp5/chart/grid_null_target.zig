const Contents = @import("observed_contents.zig").Contents;
const Cell = @import("grid_cells.zig").Cell;

pub fn resolve(chart: *const Contents, row: usize, column: usize) !*const Cell {
    const grid = &chart.prefix.grid;
    if (row >= grid.prelude.rows) return error.InvalidChartGridRow;
    if (column >= grid.prelude.columns) return error.InvalidChartGridColumn;
    const cell = &grid.cells[row * grid.prelude.columns + column];
    if (cell.value != .empty) return error.ExpectedNullChartCell;
    return cell;
}

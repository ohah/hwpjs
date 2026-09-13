const Contents = @import("observed_contents.zig").Contents;
const Reference = @import("object_table.zig").Reference;

/// Resolves one semantic Grid coordinate to its inline String definition.
pub fn resolve(chart: *const Contents, row: usize, column: usize) !Reference {
    const grid = &chart.prefix.grid;
    if (row >= grid.prelude.rows) return error.InvalidChartGridRow;
    if (column >= grid.prelude.columns) return error.InvalidChartGridColumn;
    const cell = &grid.cells[row * grid.prelude.columns + column];
    const string = switch (cell.value) {
        .string => |string| string,
        else => return error.ExpectedChartString,
    };
    return .{ .value = .{ .object_id = cell.object_id.?, .bytes = string.bytes, .trailer = string.trailer }, .introduced = true, .start = cell.start, .end = cell.end };
}

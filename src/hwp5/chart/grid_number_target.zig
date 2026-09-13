const Contents = @import("observed_contents.zig").Contents;
const Number = @import("value_object.zig").Number;

/// Resolves one semantic Grid coordinate to a uniquely referenced Double.
/// Coordinate ownership stays here; fixed-width serialization stays in
/// contents_number_edit.zig.
pub fn resolve(chart: *const Contents, row: usize, column: usize) !Number {
    const grid = &chart.prefix.grid;
    if (row >= grid.prelude.rows) return error.InvalidChartGridRow;
    if (column >= grid.prelude.columns) return error.InvalidChartGridColumn;
    const cell = &grid.cells[row * grid.prelude.columns + column];
    const payload = switch (cell.value) {
        .number => |number| number,
        else => return error.ExpectedChartNumber,
    };
    const number: Number = .{ .object_id = cell.object_id.?, .bits = payload.bits, .trailer = payload.trailer, .payload_start = cell.payload_start.?, .payload_end = cell.payload_end.? };
    try @import("contents_number_edit.zig").requireUniqueReference(&chart.prefix.objects, number.object_id);
    return number;
}

const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Cell = @import("grid_cells.zig").Cell;
const Number = @import("value_object.zig").Number;

pub fn numberReplacement(a: std.mem.Allocator, chart: *const Contents, cell: *const Cell, number: Number) ![]u8 {
    if (cell.value != .number) return error.ExpectedChartNumber;
    if (cell.object_id != number.object_id or cell.start > cell.end or cell.end > chart.source.len)
        return error.InvalidChartGridCellSpan;
    if (std.mem.readInt(u32, chart.source[cell.start..][0..4], .little) != number.object_id)
        return error.InvalidChartGridCellSpan;
    try @import("contents_number_edit.zig").validateNumber(chart, number);
    const replacement = try a.alloc(u8, 4);
    @memset(replacement, 0xff);
    return replacement;
}

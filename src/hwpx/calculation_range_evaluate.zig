//! Finite range arithmetic over injected numeric cells; no XML or cached text.
const std = @import("std");
const syntax = @import("calculation_range_expression.zig");
const references = @import("calculation_cell_reference.zig");
pub const Reader = struct { context: *anyopaque, read: *const fn (*anyopaque, references.Cell) anyerror!f64 };
pub fn evaluate(expression: syntax.Expression, current: references.Cell, rows: u32, columns: u32, max_cells: usize, reader: Reader) !f64 {
    const first = try references.resolve(expression.range.first, current, rows, columns);
    const last = try references.resolve(expression.range.last, current, rows, columns);
    if (first.row > last.row or first.column > last.column) return error.ReversedCalculationRange;
    const height: usize = @as(usize, last.row) - first.row + 1;
    const width: usize = @as(usize, last.column) - first.column + 1;
    const count = std.math.mul(usize, height, width) catch return error.LimitExceeded;
    if (count > max_cells) return error.LimitExceeded;
    if (first.row <= current.row and current.row <= last.row and first.column <= current.column and current.column <= last.column) return error.CircularCalculationReference;
    var total: f64 = 0;
    var compensation: f64 = 0;
    for (0..height) |row| {
        for (0..width) |column| {
            const source = try reader.read(reader.context, .{ .row = first.row + @as(u32, @intCast(row)), .column = first.column + @as(u32, @intCast(column)) });
            if (!std.math.isFinite(source)) return error.InvalidCalculationCellValue;
            const value = if (expression.operation == .average) source / @as(f64, @floatFromInt(count)) else source;
            const next = total + value;
            if (!std.math.isFinite(next)) return error.CalculationOverflow;
            compensation += if (@abs(total) >= @abs(value)) (total - next) + value else (value - next) + total;
            total = next;
        }
    }
    total += compensation;
    if (!std.math.isFinite(total)) return error.CalculationOverflow;
    return total;
}

test "HWPX calculation range evaluator checks budget circular and nonfinite values" {
    const Source = struct {
        values: []const f64,
        calls: usize = 0,
        fail: bool = false,
        fn read(raw: *anyopaque, cell: references.Cell) anyerror!f64 {
            const self: *@This() = @ptrCast(@alignCast(raw));
            self.calls += 1;
            if (self.fail) return error.MissingCalculationCell;
            return self.values[cell.column - 1];
        }
    };
    var source = Source{ .values = &.{ 11.2, 24.7, 16.3, 15.3 } };
    const reader = Reader{ .context = &source, .read = Source.read };
    const current = references.Cell{ .column = 5, .row = 1 };
    const expression = try syntax.parse("=SUM(B?:E?)");
    try std.testing.expectApproxEqAbs(@as(f64, 67.5), try evaluate(expression, current, 5, 6, 4, reader), 1e-12);
    try std.testing.expectEqual(@as(usize, 4), source.calls);
    source.calls = 0;
    try std.testing.expectError(error.LimitExceeded, evaluate(expression, current, 5, 6, 3, reader));
    try std.testing.expectEqual(@as(usize, 0), source.calls);
    try std.testing.expectError(error.CircularCalculationReference, evaluate(try syntax.parse("SUM(B?:F?)"), current, 5, 6, 5, reader));
    try std.testing.expectError(error.ReversedCalculationRange, evaluate(try syntax.parse("SUM(E?:B?)"), current, 5, 6, 5, reader));
    source.values = &.{ 418, 306, 237, 103 };
    try std.testing.expectEqual(@as(f64, 266), try evaluate(try syntax.parse("AVG(B?:E?)"), current, 5, 6, 4, reader));
    source.values = &.{ 1e16, 1, -1e16, 0 };
    try std.testing.expectEqual(@as(f64, 1), try evaluate(expression, current, 5, 6, 4, reader));
    source.values = &.{ std.math.nan(f64), 0, 0, 0 };
    try std.testing.expectError(error.InvalidCalculationCellValue, evaluate(expression, current, 5, 6, 4, reader));
    source.values = &.{ std.math.floatMax(f64), std.math.floatMax(f64), 0, 0 };
    try std.testing.expectError(error.CalculationOverflow, evaluate(expression, current, 5, 6, 4, reader));
    try std.testing.expectEqual(std.math.floatMax(f64) / 2, try evaluate(try syntax.parse("AVG(B?:E?)"), current, 5, 6, 4, reader));
    source.fail = true;
    try std.testing.expectError(error.MissingCalculationCell, evaluate(expression, current, 5, 6, 4, reader));
}

test "HWPX calculation range evaluator enumerates rectangular row column ownership" {
    const Source = struct {
        calls: usize = 0,
        fn read(raw: *anyopaque, cell: references.Cell) anyerror!f64 {
            const self: *@This() = @ptrCast(@alignCast(raw));
            self.calls += 1;
            return @floatFromInt(cell.row * 10 + cell.column);
        }
    };
    var source: Source = .{};
    const reader = Reader{ .context = &source, .read = Source.read };
    const current = references.Cell{ .column = 3, .row = 3 };
    try std.testing.expectEqual(@as(f64, 22), try evaluate(try syntax.parse("SUM(A1:B2)"), current, 4, 4, 4, reader));
    try std.testing.expectEqual(@as(usize, 4), source.calls);
    try std.testing.expectEqual(@as(f64, 39), try evaluate(try syntax.parse("SUM(?1:?3)"), current, 4, 4, 3, reader));
    try std.testing.expectEqual(@as(f64, 31), try evaluate(try syntax.parse("AVG(A?:C?)"), current, 4, 4, 3, reader));
}

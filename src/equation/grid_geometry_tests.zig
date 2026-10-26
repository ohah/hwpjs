const std = @import("std");
const t = std.testing;
const grid = @import("grid_geometry.zig");
const p: grid.Parameters = .{ .column_gap = 6, .row_gap = 4, .padding = 2, .thickness = 1, .axis = 5 };
const small: grid.Cell = .{ .box = .{ .width = 10, .ascent = 8, .descent = 2 }, .empty = false };
const wide: grid.Cell = .{ .box = .{ .width = 20, .ascent = 8, .descent = 2 }, .empty = false };
const blank: grid.Cell = .{ .box = .{ .width = 0, .ascent = 0, .descent = 0 }, .empty = true };
const cells = [_]grid.Cell{ small, wide, wide, small, small, small, small, small, blank };
test "equation grid geometry preserves source order while shifting final ladder row and drawing division lines" {
    var result = try grid.place(t.allocator, &cells, 3, 3, .ladder, p, .{});
    defer result.deinit();
    try t.expectEqual(@as(f64, 66), result.box.width);
    try t.expectEqual(@as(f64, 8), result.box.ascent);
    try t.expectEqual(@as(f64, 30), result.box.descent);
    try t.expectEqual(@as(f64, 23), result.cells[6].x);
    try t.expectEqual(@as(f64, 49), result.cells[7].x);
    try t.expectEqual(@as(f64, 28), result.cells[6].baseline);
    try t.expectEqual(@as(usize, 3), result.rectangles.len);
    try t.expectEqualDeep(@import("layout_metrics.zig").Rectangle{ .x = 14.5, .y = 3.5, .width = 49.5, .height = 1 }, result.rectangles[0]);
    try t.expectEqualDeep(@import("layout_metrics.zig").Rectangle{ .x = 14.5, .y = -8, .width = 1, .height = 26.5 }, result.rectangles[2]);
    try t.expectEqual(@as(f64, 10), cells[6].box.width);
}
test "equation grid geometry centers matrix baselines and frees every allocation" {
    var matrix = try grid.place(t.allocator, cells[0..4], 2, 2, .matrix, p, .{});
    defer matrix.deinit();
    try t.expectEqual(@as(f64, -9), matrix.cells[0].baseline);
    try t.expectEqual(@as(f64, 5), matrix.cells[2].baseline);
    try t.expectEqual(@as(usize, 0), matrix.rectangles.len);
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var result = try grid.place(a, &cells, 3, 3, .ladder, p, .{});
            defer result.deinit();
            try t.expectEqual(@as(usize, 9), result.cells.len);
        }
    }.run, .{});
}
test "equation grid geometry refuses inconsistent empty markers unsupported shape and invalid bounds" {
    try t.expectError(error.InvalidEquationGridLayout, grid.place(t.allocator, cells[0..8], 3, 3, .ladder, p, .{}));
    try t.expectError(error.UnsupportedEquationGridLayout, grid.place(t.allocator, cells[0..6], 2, 3, .ladder, p, .{}));
    try t.expectError(error.UnsupportedEquationGridLayout, grid.place(t.allocator, &cells, 3, 3, .sladder, p, .{}));
    try t.expectError(error.EquationLayoutLimitExceeded, grid.place(t.allocator, &cells, std.math.maxInt(usize), 3, .matrix, p, .{}));
    var bad = cells;
    bad[8].box.width = 1;
    try t.expectError(error.InvalidEquationGridLayout, grid.place(t.allocator, &bad, 3, 3, .ladder, p, .{}));
    var params = p;
    params.row_gap = 0;
    try t.expectError(error.UnsupportedEquationGridLayout, grid.place(t.allocator, &cells, 3, 3, .ladder, params, .{}));
    params = p;
    params.padding = std.math.nan(f64);
    try t.expectError(error.InvalidEquationLayoutMetric, grid.place(t.allocator, &cells, 3, 3, .ladder, params, .{}));
}
test "equation grid geometry encloses varied decimal cells and zero padding division lines" {
    for (0..128) |i| {
        const scale = @as(f64, @floatFromInt(i + 1)) / 10;
        var varied = cells;
        for (varied[0..8]) |*cell| cell.box = .{ .width = scale * 0.3, .ascent = scale * 0.6, .descent = scale * 0.2 };
        var result = try grid.place(t.allocator, &varied, 3, 3, .ladder, .{ .column_gap = scale * 0.6, .row_gap = scale * 0.3, .padding = 0, .thickness = scale * 0.05, .axis = scale * 0.25 }, .{});
        defer result.deinit();
        for (result.cells) |cell| try t.expect(cell.x + cell.box.width <= result.box.width);
        for (result.rectangles) |rect| {
            try t.expect(rect.x + rect.width <= result.box.width);
            try t.expect(rect.y >= -result.box.ascent);
            try t.expect(rect.y + rect.height <= result.box.descent);
        }
    }
}

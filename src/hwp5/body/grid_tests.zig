const std = @import("std");
const t = std.testing;
const grid = @import("table_grid.zig");
const Rows = @import("table.zig").Rows;
test "grid sweep agrees with dense oracle for every subset of 2x2 rectangles in both orders" {
    var rectangles: [9]grid.Rectangle = undefined;
    var n: usize = 0;
    for (0..2) |y| for (0..2) |x| {
        for (1..3 - y) |h| for (1..3 - x) |w| {
            rectangles[n] = .{ .row = @intCast(y), .column = @intCast(x), .row_span = @intCast(h), .column_span = @intCast(w) };
            n += 1;
        };
    };
    try t.expectEqual(9, n);
    for (0..512) |mask| {
        var cells: [9]grid.Rectangle = undefined;
        var count: usize = 0;
        var dense = [_]u8{0} ** 4;
        var starts = [_]u16{0} ** 2;
        var overlap = false;
        for (rectangles, 0..) |c, i| {
            if (mask & (@as(usize, 1) << @intCast(i)) == 0) continue;
            cells[count] = c;
            count += 1;
            starts[c.row] += 1;
            for (c.row..c.row + c.row_span) |y| for (c.column..c.column + c.column_span) |x| {
                if (dense[y * 2 + x] != 0) overlap = true;
                dense[y * 2 + x] += 1;
            };
        }
        var raw: [4]u8 = undefined;
        for (starts, 0..) |v, i| std.mem.writeInt(u16, raw[i * 2 ..][0..2], v, .little);
        const rows = try Rows.parse(&raw);
        for (0..2) |_| {
            const result = grid.validate(t.allocator, 2, 2, rows, cells[0..count]);
            if (overlap) try t.expectError(error.OverlappingTableCells, result) else if (std.mem.indexOfScalar(u8, &dense, 0) != null) try t.expectError(error.IncompleteTableGrid, result) else try result;
            std.mem.reverse(grid.Rectangle, cells[0..count]);
        }
    }
}
test "maximum logical grid needs bounded memory and widened area arithmetic" {
    const raw = try t.allocator.alloc(u8, 65535 * 2);
    defer t.allocator.free(raw);
    @memset(raw, 0);
    raw[0] = 1;
    try grid.validate(t.allocator, 65535, 65535, try Rows.parse(raw), &.{.{ .row = 0, .column = 0, .row_span = 65535, .column_span = 65535 }});
}
test "grid row distribution, dimensions and span validation do not silently normalize" {
    const rows = try Rows.parse(&.{ 1, 0, 0, 0 });
    const c: grid.Rectangle = .{ .row = 1, .column = 0, .row_span = 1, .column_span = 1 };
    try t.expectError(error.TableRowCellCountMismatch, grid.validate(t.allocator, 2, 1, rows, &.{c}));
    try t.expectError(error.TableRowCellCountMismatch, grid.validate(t.allocator, 2, 1, rows, &.{}));
    try t.expectError(error.InvalidTableDimensions, grid.validate(t.allocator, 0, 1, rows, &.{}));
    try t.expectError(error.InvalidTableRowCount, grid.validate(t.allocator, 1, 1, rows, &.{}));
    try t.expectError(error.InvalidCellSpan, c.validate(1, 1));
    try t.expectError(error.InvalidCellSpan, (grid.Rectangle{ .row = 65535, .column = 65535, .row_span = 65535, .column_span = 65535 }).validate(65535, 65535));
}
fn allocationCase(a: std.mem.Allocator) !void {
    const rows = try Rows.parse(&.{ 1, 0 });
    try grid.validate(a, 1, 1, rows, &.{.{ .row = 0, .column = 0, .row_span = 1, .column_span = 1 }});
}
fn lateFailure(a: std.mem.Allocator) !void {
    const c: grid.Rectangle = .{ .row = 0, .column = 0, .row_span = 1, .column_span = 1 };
    grid.validate(a, 1, 2, try Rows.parse(&.{ 2, 0 }), &.{ c, c }) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.OverlappingTableCells, err);
        return;
    };
    return error.TestExpectedError;
}
test "grid releases all allocations on success, OOM and late overlap" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{});
    try t.checkAllAllocationFailures(t.allocator, lateGap, .{});
}
fn lateGap(a: std.mem.Allocator) !void {
    const c: grid.Rectangle = .{ .row = 0, .column = 0, .row_span = 1, .column_span = 1 };
    grid.validate(a, 1, 2, try Rows.parse(&.{ 1, 0 }), &.{c}) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.IncompleteTableGrid, err);
        return;
    };
    return error.TestExpectedError;
}

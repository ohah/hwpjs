const std = @import("std");
const p = @import("model/source_table_span_grid.zig");
const a = std.testing.allocator;
const cells = [_]p.Cell{
    .{ .row = 0, .column = 0, .row_span = 2, .column_span = 1, .width = 60, .height = 50 },
    .{ .row = 0, .column = 1, .row_span = 1, .column_span = 1, .width = 40, .height = 20 },
    .{ .row = 1, .column = 1, .row_span = 1, .column_span = 1, .width = 40, .height = 30 },
};
test "source span grid crossing insertion and deletion preserve the surviving owner" {
    const x = try p.prepare(a, 2, 2, &cells, 100, 50, .{ .insert_row = 1 }, 100);
    defer x.deinit(a);
    try std.testing.expectEqual(@as(u32, 3), x.cells[0].cell.row_span);
    try std.testing.expectEqual(@as(u32, 70), x.height);
    try std.testing.expectEqual(@as(usize, 1), x.inserted_count);
    const y = try p.prepare(a, 2, 2, &cells, 100, 50, .{ .delete_row = 0 }, 100);
    defer y.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), y.cells[0].source);
    try std.testing.expectEqual(@as(u32, 1), y.cells[0].cell.row_span);
    try std.testing.expectEqual(@as(u32, 30), y.height);
}
test "source span grid refuses ambiguous tracks and overlap without guessing" {
    const whole = [_]p.Cell{.{ .row = 0, .column = 0, .row_span = 2, .column_span = 2, .width = 100, .height = 50 }};
    try std.testing.expectError(error.AmbiguousSourceTableTracks, p.prepare(a, 2, 2, &whole, 100, 50, .{ .insert_row = 1 }, 100));
    var bad = cells;
    bad[1].column = 0;
    try std.testing.expectError(error.InvalidSourceSpanGrid, p.prepare(a, 2, 2, &bad, 100, 50, .{ .insert_column = 1 }, 100));
}
test "source span grid refuses deletion that would erase the last explicit track witness" {
    try std.testing.expectError(error.AmbiguousSourceTableTracks, p.prepare(a, 2, 2, &cells, 100, 50, .{ .delete_column = 1 }, 100));
}
test "source span grid all four actions survive every allocation failure" {
    const commands = [_]@import("model/table_grid_edit_plan.zig").Command{ .{ .insert_row = 1 }, .{ .delete_row = 0 }, .{ .insert_column = 1 }, .{ .delete_column = 0 } };
    for (commands) |command| try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, c: @import("model/table_grid_edit_plan.zig").Command) !void {
            const result = try p.prepare(allocator, 2, 2, &cells, 100, 50, c, 100);
            defer result.deinit(allocator);
        }
    }.run, .{command});
}

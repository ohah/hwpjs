const std = @import("std");
const columns = @import("source_table_column_grid.zig");
const spans = @import("source_table_span_grid.zig");
const a = std.testing.allocator;
// Independent source values, including unequal heights within the same row.
const cells = [_]spans.Cell{
    .{ .row = 0, .column = 0, .row_span = 1, .column_span = 1, .width = 9, .height = 2 },
    .{ .row = 0, .column = 1, .row_span = 1, .column_span = 1, .width = 18, .height = 3 },
    .{ .row = 0, .column = 2, .row_span = 1, .column_span = 1, .width = 20, .height = 3 },
    .{ .row = 1, .column = 0, .row_span = 1, .column_span = 1, .width = 9, .height = 2 },
    .{ .row = 1, .column = 1, .row_span = 1, .column_span = 1, .width = 18, .height = 1 },
    .{ .row = 1, .column = 2, .row_span = 1, .column_span = 1, .width = 20, .height = 2 },
};

test "source column grid retains each height and independent table bound" {
    const plan = try columns.prepareSource(a, 2, 3, &cells, 47, 62, .{ .insert_column = 1 }, 100);
    defer plan.deinit(a);
    try std.testing.expectEqual(@as(u32, 56), plan.width);
    try std.testing.expectEqual(@as(u32, 62), plan.height);
    try std.testing.expectEqual(@as(usize, 2), plan.inserted_count);
    const sources = [_]usize{ 0, 0, 1, 2, 3, 3, 4, 5 };
    for (plan.cells, sources, 0..) |item, source, i| {
        try std.testing.expectEqual(source, item.source);
        try std.testing.expectEqual(cells[source].height, item.cell.height);
        try std.testing.expectEqual(cells[source].width, item.cell.width);
        try std.testing.expectEqual(i % 4 == 1, item.fresh);
        try std.testing.expectEqual(@as(u32, @intCast(i / 4)), item.cell.row);
        try std.testing.expectEqual(@as(u32, @intCast(i % 4)), item.cell.column);
    }
    const removed = try columns.prepareSource(a, 2, 3, &cells, 47, 62, .{ .delete_column = 0 }, 100);
    defer removed.deinit(a);
    try std.testing.expectEqual(@as(u32, 38), removed.width);
    try std.testing.expectEqual(@as(u32, 62), removed.height);
    const retained = [_]usize{ 1, 2, 4, 5 };
    for (removed.cells, retained) |item, source| {
        try std.testing.expectEqual(source, item.source);
        try std.testing.expectEqual(cells[source].height, item.cell.height);
        try std.testing.expect(!item.fresh);
    }
}

test "source column grid refuses vertical bound changes malformed coverage and conflicting widths" {
    var input = cells;
    input[0].height = 4;
    try std.testing.expectError(error.UnsupportedSourceSpanGeometry, columns.prepareSource(a, 2, 3, &input, 47, 62, .{ .delete_column = 0 }, 100));
    input = cells;
    input[5].width = 21;
    try std.testing.expectError(error.ConflictingSourceTableTracks, columns.prepareSource(a, 2, 3, &input, 47, 62, .{ .insert_column = 1 }, 100));
    input = cells;
    input[5].column = 1;
    try std.testing.expectError(error.InvalidSourceSpanGrid, columns.prepareSource(a, 2, 3, &input, 47, 62, .{ .insert_column = 1 }, 100));
    try std.testing.expectError(error.LimitExceeded, columns.prepareSource(a, 2, 3, &cells, 47, 62, .{ .insert_column = 1 }, 6));
    try std.testing.expectError(error.InvalidTableGridEdit, columns.prepareSource(a, 2, 3, &cells, 47, 62, .{ .delete_column = 3 }, 100));
}

test "source column grid keeps established row and merged refusal policy" {
    try std.testing.expectError(error.ConflictingSourceTableTracks, columns.prepareSource(a, 2, 3, &cells, 47, 62, .{ .insert_row = 1 }, 100));
    var input = cells;
    input[0].column_span = 2;
    try std.testing.expectError(error.InvalidSourceSpanGrid, columns.prepareSource(a, 2, 3, &input, 47, 62, .{ .insert_column = 1 }, 100));
}

test "source column grid detached allocation failures retain all source values" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn attempt(allocator: std.mem.Allocator) !void {
            const snapshot = cells;
            const result = columns.prepareSource(allocator, 2, 3, &cells, 47, 62, .{ .insert_column = 1 }, 100) catch |err| {
                try std.testing.expectEqualDeep(snapshot, cells);
                return err;
            };
            defer result.deinit(allocator);
            try std.testing.expectEqualDeep(snapshot, cells);
        }
    }.attempt, .{});
}

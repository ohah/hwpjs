const std = @import("std");
const tracks = @import("model/source_table_tracks.zig");
const plan = @import("model/source_table_span_grid.zig");
const a = std.testing.allocator;
const constraints = [_]tracks.Constraint{
    .{ .start = 0, .end = 2, .length = 100 },
    .{ .start = 2, .end = 3, .length = 30 },
    .{ .start = 0, .end = 1, .length = 40 },
    .{ .start = 1, .end = 3, .length = 90 },
};
test "source exact tracks infer a missing single-span witness without rounding" {
    const v = try tracks.resolve(a, 3, 130, &constraints);
    defer a.free(v);
    try std.testing.expectEqualSlices(u32, &.{ 40, 60, 30 }, v);
    var reverse = constraints;
    std.mem.reverse(tracks.Constraint, &reverse);
    const r = try tracks.resolve(a, 3, 130, &reverse);
    defer a.free(r);
    try std.testing.expectEqualSlices(u32, v, r);
}
test "source exact tracks reject contradictions disconnection nonpositive and oversized solutions" {
    var bad = constraints;
    bad[3].length = 91;
    try std.testing.expectError(error.ConflictingSourceTableTracks, tracks.resolve(a, 3, 130, &bad));
    try std.testing.expectError(error.AmbiguousSourceTableTracks, tracks.resolve(a, 3, 130, &.{.{ .start = 0, .end = 3, .length = 130 }}));
    try std.testing.expectError(error.UnsupportedSourceSpanGeometry, tracks.resolve(a, 2, 100, &.{.{ .start = 0, .end = 1, .length = 100 }}));
    try std.testing.expectError(error.UnsupportedSourceSpanGeometry, tracks.resolve(a, 2, 100, &.{.{ .start = 0, .end = 1, .length = 101 }}));
    try std.testing.expectError(error.UnsupportedSourceSpanGeometry, tracks.resolve(a, 1, 0x80000000, &.{}));
    try std.testing.expectError(error.UnsupportedSourceSpanGeometry, tracks.resolve(a, 3, 130, &.{.{ .start = 0, .end = 4, .length = 100 }}));
}
test "source exact tracks every allocation failure" {
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator) !void {
            const v = try tracks.resolve(allocator, 3, 130, &constraints);
            defer allocator.free(v);
        }
    }.run, .{});
}
test "source exact tracks complete direct evidence avoids a per-cell graph" {
    var repeated: [10000]tracks.Constraint = undefined;
    @memset(&repeated, .{ .start = 0, .end = 1, .length = 40 });
    var storage: [128]u8 = undefined;
    var buffer = std.heap.FixedBufferAllocator.init(&storage);
    const result = try tracks.resolve(buffer.allocator(), 1, 40, &repeated);
    try std.testing.expectEqualSlices(u32, &.{40}, result);
}
test "source exact tracks row and column grid edits retain a uniquely determined output" {
    const cells = [_]plan.Cell{
        .{ .row = 0, .column = 0, .row_span = 1, .column_span = 2, .width = 100, .height = 20 },
        .{ .row = 0, .column = 2, .row_span = 1, .column_span = 1, .width = 30, .height = 20 },
        .{ .row = 1, .column = 0, .row_span = 1, .column_span = 1, .width = 40, .height = 30 },
        .{ .row = 1, .column = 1, .row_span = 1, .column_span = 2, .width = 90, .height = 30 },
    };
    const commands = [_]@import("model/table_grid_edit_plan.zig").Command{ .{ .insert_row = 1 }, .{ .delete_row = 0 }, .{ .insert_column = 1 }, .{ .delete_column = 0 } };
    for (commands) |command| {
        if (command == .delete_row) {
            // The other row alone leaves its merged columns underdetermined.
            try std.testing.expectError(error.AmbiguousSourceTableTracks, plan.prepare(a, 2, 3, &cells, 130, 50, command, 100));
            continue;
        }
        const p = try plan.prepare(a, 2, 3, &cells, 130, 50, command, 100);
        defer p.deinit(a);
        try std.testing.expect(p.cells.len > 0);
    }
}

test "source exact tracks inferred grid all allocation failures remain atomic" {
    const commands = [_]@import("model/table_grid_edit_plan.zig").Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_column = 0 } };
    for (commands) |command| try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, c: @import("model/table_grid_edit_plan.zig").Command) !void {
            const input = [_]plan.Cell{
                .{ .row = 0, .column = 0, .row_span = 1, .column_span = 2, .width = 100, .height = 20 },
                .{ .row = 0, .column = 2, .row_span = 1, .column_span = 1, .width = 30, .height = 20 },
                .{ .row = 1, .column = 0, .row_span = 1, .column_span = 1, .width = 40, .height = 30 },
                .{ .row = 1, .column = 1, .row_span = 1, .column_span = 2, .width = 90, .height = 30 },
            };
            const result = try plan.prepare(allocator, 2, 3, &input, 130, 50, c, 100);
            defer result.deinit(allocator);
        }
    }.run, .{command});
}

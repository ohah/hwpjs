//! Own synthetic constraints and literal expected geometry; no external fixture.
const std = @import("std");
const geometry = @import("source_table_row_geometry.zig");
const spans = @import("../../model/source_table_span_grid.zig");
const Command = @import("../../model/table_grid_edit_plan.zig").Command;
const a = std.testing.allocator;
const regular = [_]spans.Cell{
    .{ .row = 0, .column = 0, .row_span = 1, .column_span = 1, .width = 6000, .height = 2000 },
    .{ .row = 0, .column = 1, .row_span = 1, .column_span = 1, .width = 14000, .height = 2000 },
    .{ .row = 1, .column = 0, .row_span = 1, .column_span = 1, .width = 6000, .height = 3000 },
    .{ .row = 1, .column = 1, .row_span = 1, .column_span = 1, .width = 14000, .height = 3000 },
};
const merged = [_]spans.Cell{
    .{ .row = 0, .column = 0, .row_span = 2, .column_span = 1, .width = 6000, .height = 5000 },
    .{ .row = 0, .column = 1, .row_span = 1, .column_span = 1, .width = 14000, .height = 2000 },
    .{ .row = 1, .column = 1, .row_span = 1, .column_span = 1, .width = 14000, .height = 3000 },
};

test "HWP5 independent frame row focused negative offset first middle last edits" {
    const Case = struct { command: Command, frame: u32, tracks: u32 };
    const cases = [_]Case{
        .{ .command = .{ .insert_row = 0 }, .frame = 6000, .tracks = 7000 },
        .{ .command = .{ .insert_row = 1 }, .frame = 6000, .tracks = 7000 },
        .{ .command = .{ .insert_row = 2 }, .frame = 7000, .tracks = 8000 },
        .{ .command = .{ .delete_row = 0 }, .frame = 2000, .tracks = 3000 },
        .{ .command = .{ .delete_row = 1 }, .frame = 1000, .tracks = 2000 },
    };
    for (cases) |case| {
        const result = try geometry.prepare(a, 2, 2, &regular, 20000, 4000, case.command, 100);
        defer result.deinit(a);
        try std.testing.expect(result.independent_frame);
        try std.testing.expectEqual(@as(?u32, 5000), result.input_track_height);
        try std.testing.expectEqual(case.frame, result.frame_height);
        try std.testing.expectEqual(case.tracks, result.shape.height);
        try std.testing.expectEqual(@as(i64, -1000), @as(i64, result.frame_height) - result.shape.height);
        try std.testing.expectEqual(@as(u32, 20000), result.shape.width);
    }
}

test "HWP5 independent frame row focused positive and zero offsets preserve old exact plans" {
    for ([_]u32{ 5000, 6000 }) |frame| {
        const result = try geometry.prepare(a, 2, 2, &regular, 20000, frame, .{ .insert_row = 1 }, 100);
        defer result.deinit(a);
        try std.testing.expectEqual(frame + 2000, result.frame_height);
        try std.testing.expectEqual(@as(u32, 7000), result.shape.height);
        try std.testing.expectEqual(frame != 5000, result.independent_frame);
        if (frame == 5000) {
            const old = try spans.prepare(a, 2, 2, &regular, 20000, frame, .{ .insert_row = 1 }, 100);
            defer old.deinit(a);
            try std.testing.expectEqualDeep(old.cells, result.shape.cells);
        }
    }
}

test "HWP5 independent frame row focused frame bounds refuse zero negative and overflow" {
    for ([_]u32{ 2000, 3000 }) |frame|
        try std.testing.expectError(error.UnsupportedSourceSpanGeometry, geometry.prepare(a, 2, 2, &regular, 20000, frame, .{ .delete_row = 1 }, 100));
    try std.testing.expectError(error.UnsupportedSourceSpanGeometry, geometry.prepare(a, 2, 2, &regular, 20000, std.math.maxInt(u32), .{ .insert_row = 1 }, 100));
    try std.testing.expectError(error.InvalidTableGridEdit, geometry.prepare(a, 2, 2, &regular, 20000, 4000, .{ .delete_row = 2 }, 100));
}

test "HWP5 independent frame row focused merged survival keeps exact owner mapping" {
    const result = try geometry.prepare(a, 2, 2, &merged, 20000, 4000, .{ .insert_row = 1 }, 100);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(u32, 6000), result.frame_height);
    try std.testing.expectEqual(@as(u32, 7000), result.shape.height);
    try std.testing.expectEqual(@as(usize, 1), result.shape.inserted_count);
    try std.testing.expectEqual(@as(usize, 4), result.shape.cells.len);
    const left = result.shape.cells[0];
    try std.testing.expect(!left.fresh);
    try std.testing.expectEqual(@as(usize, 0), left.source);
    try std.testing.expectEqual(@as(u32, 3), left.cell.row_span);
    try std.testing.expectEqual(@as(u32, 7000), left.cell.height);
    const fresh = result.shape.cells[2];
    try std.testing.expect(fresh.fresh);
    try std.testing.expectEqual(@as(usize, 1), fresh.source);
    try std.testing.expectEqual(@as(u32, 2000), fresh.cell.height);
    try std.testing.expectEqual(@as(usize, 2), result.shape.cells[3].source);
}

test "HWP5 independent frame row focused ambiguous and conflicting tracks stay refused" {
    const ambiguous = [_]spans.Cell{ merged[0], .{ .row = 0, .column = 1, .row_span = 2, .column_span = 1, .width = 14000, .height = 5000 } };
    try std.testing.expectError(error.AmbiguousSourceTableTracks, geometry.prepare(a, 2, 2, &ambiguous, 20000, 4000, .{ .insert_row = 1 }, 100));
    var conflict = regular;
    conflict[3].height = 4000;
    try std.testing.expectError(error.ConflictingSourceTableTracks, geometry.prepare(a, 2, 2, &conflict, 20000, 4000, .{ .insert_row = 1 }, 100));
    var hole = regular;
    hole[2].row = 0;
    try std.testing.expectError(error.InvalidSourceSpanGrid, geometry.prepare(a, 2, 2, &hole, 20000, 4000, .{ .insert_row = 1 }, 100));
}

test "HWP5 independent frame row focused columns retain existing frame and source heights" {
    const result = try geometry.prepare(a, 2, 2, &regular, 20000, 4000, .{ .insert_column = 1 }, 100);
    defer result.deinit(a);
    try std.testing.expect(!result.independent_frame);
    try std.testing.expectEqual(@as(u32, 4000), result.frame_height);
    try std.testing.expectEqual(@as(u32, 4000), result.shape.height);
    try std.testing.expectEqual(@as(?u32, null), result.input_track_height);
    for (result.shape.cells) |cell| try std.testing.expectEqual(regular[cell.source].height, cell.cell.height);
}

test "HWP5 independent frame row OOM successful and refused plans stay atomic" {
    for ([_]u32{ 4000, 2000 }) |frame| try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, f: u32) !void {
            const before = regular;
            const result = geometry.prepare(allocator, 2, 2, &regular, 20000, f, .{ .delete_row = 1 }, 100) catch |err| {
                try std.testing.expectEqualDeep(before, regular);
                if (f == 2000 and err == error.UnsupportedSourceSpanGeometry) return;
                return err;
            };
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(u32, 4000), f);
            try std.testing.expectEqualDeep(before, regular);
        }
    }.run, .{frame});
}

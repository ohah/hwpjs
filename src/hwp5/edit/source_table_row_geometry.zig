//! HWP5-only proposed row policy: keep frame minus exact cell-track extent.
//! This is an edit policy candidate, not an official frame-layout interpretation.
const std = @import("std");
const spans = @import("../../model/source_table_span_grid.zig");
const columns = @import("../../model/source_table_column_grid.zig");
const Command = @import("../../model/table_grid_edit_plan.zig").Command;

pub const Geometry = struct {
    shape: spans.Plan,
    frame_height: u32,
    input_track_height: ?u32,
    independent_frame: bool,

    pub fn deinit(self: Geometry, a: std.mem.Allocator) void {
        self.shape.deinit(a);
    }
};

// The caller proves physical source order and the span planner proves complete
// two-dimensional ownership. Column zero supplies a concrete 0..rows chain,
// not a guessed row maximum or an equally divided object declaration.
fn columnZeroExtent(rows: u32, cells: []const spans.Cell) !u32 {
    var cursor: u32 = 0;
    var height: u32 = 0;
    for (cells) |cell| {
        if (cell.column != 0) continue;
        if (cell.row != cursor or cell.row_span == 0 or cursor > rows or cell.row_span > rows - cursor or cell.height == 0) return error.InvalidSourceSpanGrid;
        cursor += cell.row_span;
        height = std.math.add(u32, height, cell.height) catch return error.UnsupportedSourceSpanGeometry;
    }
    if (cursor != rows or height == 0) return error.InvalidSourceSpanGrid;
    return height;
}

pub fn prepare(a: std.mem.Allocator, rows: u32, cols: u32, cells: []const spans.Cell, width: u32, frame_height: u32, command: Command, limit: usize) !Geometry {
    // Preserve the established column path, exact F=T path, error priority and
    // allocation failures. Only a proven track contradiction may try the new
    // independent-frame policy; ambiguous geometry and OOM never become fallback.
    const prior = columns.prepareSource(a, rows, cols, cells, width, frame_height, command, limit);
    if (prior) |shape| return .{
        .shape = shape,
        .frame_height = shape.height,
        .input_track_height = if (command == .insert_row or command == .delete_row) frame_height else null,
        .independent_frame = false,
    } else |err| {
        if ((command != .insert_row and command != .delete_row) or err != error.ConflictingSourceTableTracks) return err;
        const total = try columnZeroExtent(rows, cells);
        if (total == frame_height) return err;
        const shape = try spans.prepare(a, rows, cols, cells, width, total, command, limit);
        errdefer shape.deinit(a);
        const delta = try std.math.sub(i64, @as(i64, shape.height), @as(i64, total));
        const next = try std.math.add(i64, @as(i64, frame_height), delta);
        const output_frame = std.math.cast(u32, next) orelse return error.UnsupportedSourceSpanGeometry;
        if (frame_height == 0 or output_frame == 0) return error.UnsupportedSourceSpanGeometry;
        if (@as(i64, output_frame) - @as(i64, shape.height) != @as(i64, frame_height) - @as(i64, total)) return error.UnsupportedSourceSpanGeometry;
        return .{ .shape = shape, .frame_height = output_frame, .input_track_height = total, .independent_frame = true };
    }
}

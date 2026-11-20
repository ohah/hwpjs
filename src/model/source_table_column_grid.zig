//! Column-only edits over an unmerged source grid. Source heights are retained;
//! they are not equations that reconstruct the table's displayed height.
const std = @import("std");
const grid = @import("table_grid_edit_plan.zig");
const spans = @import("source_table_span_grid.zig");
const tracks = @import("source_table_tracks.zig");

pub fn prepare(a: std.mem.Allocator, rows: u32, columns: u32, cells: []const spans.Cell, width: u32, height: u32, command: grid.Command, limit: usize) !spans.Plan {
    const edit = try grid.create(rows, columns, command, limit);
    if (edit.row_edit or height == 0) return error.UnsupportedSourceSpanGeometry;
    if (cells.len != @as(usize, rows) * columns) return error.InvalidSourceSpanGrid;
    const constraints = try a.alloc(tracks.Constraint, cells.len);
    defer a.free(constraints);
    const before = try a.alloc(u32, rows);
    defer a.free(before);
    @memset(before, 0);
    for (cells, 0..) |c, i| {
        if (c.row != i / columns or c.column != i % columns or c.row_span != 1 or c.column_span != 1) return error.InvalidSourceSpanGrid;
        if (c.width == 0 or c.height == 0 or c.width > 0x7fffffff or c.height > 0x7fffffff) return error.UnsupportedSourceSpanGeometry;
        constraints[i] = .{ .start = c.column, .end = c.column + 1, .length = c.width };
        before[c.row] = @max(before[c.row], c.height);
    }
    // Shared exact horizontal interval solver; never infer equal column widths.
    const widths = try tracks.resolve(a, columns, width, constraints);
    defer a.free(widths);
    var next_width: u32 = 0;
    for (0..edit.columns) |column| {
        const template = try edit.templateIndex(0, @intCast(column));
        next_width = try std.math.add(u32, next_width, widths[template % columns]);
    }
    const after = try a.alloc(u32, rows);
    defer a.free(after);
    @memset(after, 0);
    const output = try a.alloc(spans.Output, @as(usize, rows) * edit.columns);
    errdefer a.free(output);
    for (output, 0..) |*item, i| {
        const row: u32 = @intCast(i / edit.columns);
        const column: u32 = @intCast(i % edit.columns);
        const source = try edit.templateIndex(row, column);
        var cell = cells[source];
        cell.column = column;
        item.* = .{ .source = source, .fresh = (try edit.sourceIndex(row, column)) == null, .cell = cell };
        after[row] = @max(after[row], cell.height);
    }
    // Deleting the only tallest cell must not silently change vertical bounds.
    // Row maxima are preservation invariants, not replacement layout metrics.
    if (!std.mem.eql(u32, before, after)) return error.UnsupportedSourceSpanGeometry;
    return .{ .rows = rows, .columns = edit.columns, .width = next_width, .height = height, .cells = output, .inserted_count = edit.inserted_count };
}

/// Preserve the established span/row policy for every other source shape.
pub fn prepareSource(a: std.mem.Allocator, rows: u32, columns: u32, cells: []const spans.Cell, width: u32, height: u32, command: grid.Command, limit: usize) !spans.Plan {
    const column_edit = command == .insert_column or command == .delete_column;
    if (column_edit) {
        var regular = true;
        for (cells) |cell| if (cell.row_span != 1 or cell.column_span != 1) {
            regular = false;
            break;
        };
        if (regular) return prepare(a, rows, columns, cells, width, height, command, limit);
    }
    return spans.prepare(a, rows, columns, cells, width, height, command, limit);
}

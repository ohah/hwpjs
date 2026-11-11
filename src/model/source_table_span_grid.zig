//! Source-only span policy. Payloads and fresh identities stay with format owners.
//! Exact source interval equations must determine every track; no equal-size guessing.
const std = @import("std");
const regular = @import("table_grid_edit_plan.zig");
pub const Cell = struct { row: u32, column: u32, row_span: u32, column_span: u32, width: u32, height: u32 };
pub const Output = struct { source: usize, fresh: bool, cell: Cell };
pub const Plan = struct {
    rows: u32,
    columns: u32,
    width: u32,
    height: u32,
    cells: []Output,
    inserted_count: usize,
    pub fn deinit(self: Plan, a: std.mem.Allocator) void {
        a.free(self.cells);
    }
};
const empty = std.math.maxInt(usize);
fn prefix(a: std.mem.Allocator, tracks: []const u32) ![]u32 {
    const out = try a.alloc(u32, tracks.len + 1);
    errdefer a.free(out);
    out[0] = 0;
    for (tracks, 0..) |v, i| out[i + 1] = try std.math.add(u32, out[i], v);
    return out;
}
fn place(owners: []usize, rows: u32, cols: u32, c: Cell, id: usize) !void {
    if (c.row_span == 0 or c.column_span == 0 or c.row >= rows or c.column >= cols or c.row_span > rows - c.row or c.column_span > cols - c.column) return error.InvalidSourceSpanGrid;
    for (c.row..c.row + c.row_span) |r| for (c.column..c.column + c.column_span) |col| {
        const index = r * cols + col;
        if (owners[index] != empty) return error.InvalidSourceSpanGrid;
        owners[index] = id;
    };
}
fn resolveTracks(a: std.mem.Allocator, cells: []const Cell, count: u32, total: u32, row: bool) ![]u32 {
    const tracks = @import("source_table_tracks.zig");
    const constraints = try a.alloc(tracks.Constraint, cells.len);
    defer a.free(constraints);
    for (cells, constraints) |c, *constraint| {
        const start = if (row) c.row else c.column;
        constraint.* = .{ .start = start, .end = start + (if (row) c.row_span else c.column_span), .length = if (row) c.height else c.width };
    }
    return tracks.resolve(a, count, total, constraints);
}
fn nextTracks(a: std.mem.Allocator, old: []const u32, edit: regular.Plan, axis: bool) ![]u32 {
    const n = if (axis) (if (edit.row_edit) edit.rows else edit.columns) else @as(u32, @intCast(old.len));
    const out = try a.alloc(u32, n);
    for (out, 0..) |*v, i| {
        const changed = axis and edit.insertion and i == edit.index;
        const prior = if (!axis) i else if (changed) edit.index - @intFromBool(edit.index != 0) else if (edit.insertion) i - @intFromBool(i > edit.index) else i + @intFromBool(i >= edit.index);
        v.* = old[prior];
    }
    return out;
}
pub fn prepare(a: std.mem.Allocator, rows: u32, cols: u32, cells: []const Cell, width: u32, height: u32, command: regular.Command, limit: usize) !Plan {
    const edit = try regular.create(rows, cols, command, limit);
    if (cells.len == 0 or cells.len > @as(usize, rows) * cols) return error.InvalidSourceSpanGrid;
    const owners = try a.alloc(usize, @as(usize, rows) * cols);
    defer a.free(owners);
    @memset(owners, empty);
    for (cells, 0..) |c, i| {
        if (c.width == 0 or c.height == 0 or c.width > 0x7fffffff or c.height > 0x7fffffff) return error.UnsupportedSourceSpanGeometry;
        try place(owners, rows, cols, c, i);
    }
    for (owners) |v| if (v == empty) return error.InvalidSourceSpanGrid;
    const ws = try resolveTracks(a, cells, cols, width, false);
    defer a.free(ws);
    const hs = try resolveTracks(a, cells, rows, height, true);
    defer a.free(hs);
    const xp = try prefix(a, ws);
    defer a.free(xp);
    const yp = try prefix(a, hs);
    defer a.free(yp);
    if (xp[cols] != width or yp[rows] != height) return error.UnsupportedSourceSpanGeometry;
    for (cells) |c| if (c.width != xp[c.column + c.column_span] - xp[c.column] or c.height != yp[c.row + c.row_span] - yp[c.row]) return error.UnsupportedSourceSpanGeometry;
    const nw = try nextTracks(a, ws, edit, !edit.row_edit);
    defer a.free(nw);
    const nh = try nextTracks(a, hs, edit, edit.row_edit);
    defer a.free(nh);
    const nx = try prefix(a, nw);
    defer a.free(nx);
    const ny = try prefix(a, nh);
    defer a.free(ny);
    const mapped = try a.alloc(usize, @as(usize, edit.rows) * edit.columns);
    defer a.free(mapped);
    @memset(mapped, empty);
    var output: std.ArrayList(Output) = .empty;
    defer output.deinit(a);
    for (cells, 0..) |source, i| {
        var c = source;
        const start = if (edit.row_edit) c.row else c.column;
        const span = if (edit.row_edit) c.row_span else c.column_span;
        var ns = start;
        var np = span;
        if (edit.insertion) {
            if (start >= edit.index) ns += 1 else if (start + span > edit.index) np += 1;
        } else if (start <= edit.index and edit.index < start + span) {
            if (span == 1) continue;
            np -= 1;
        } else if (start > edit.index) ns -= 1;
        if (edit.row_edit) {
            c.row = ns;
            c.row_span = np;
        } else {
            c.column = ns;
            c.column_span = np;
        }
        c.width = nx[c.column + c.column_span] - nx[c.column];
        c.height = ny[c.row + c.row_span] - ny[c.row];
        try place(mapped, edit.rows, edit.columns, c, output.items.len);
        try output.append(a, .{ .source = i, .fresh = false, .cell = c });
    }
    var fresh: usize = 0;
    for (0..edit.rows) |r| for (0..edit.columns) |col| {
        if (mapped[r * edit.columns + col] != empty) continue;
        if (!edit.insertion or (if (edit.row_edit) r else col) != edit.index) return error.InvalidSourceSpanGrid;
        const adjacent = edit.index - @intFromBool(edit.index != 0);
        const old_index = if (edit.row_edit) adjacent * cols + col else r * cols + adjacent;
        const source = owners[old_index];
        var span: u32 = 1;
        while (true) {
            const rr = if (edit.row_edit) r else r + span;
            const cc = if (edit.row_edit) col + span else col;
            if (rr >= edit.rows or cc >= edit.columns or mapped[rr * edit.columns + cc] != empty) break;
            const old = if (edit.row_edit) adjacent * cols + cc else rr * cols + adjacent;
            if (owners[old] != source) break;
            span += 1;
        }
        const c = Cell{ .row = @intCast(r), .column = @intCast(col), .row_span = if (edit.row_edit) 1 else span, .column_span = if (edit.row_edit) span else 1, .width = nx[col + (if (edit.row_edit) span else 1)] - nx[col], .height = ny[r + (if (edit.row_edit) 1 else span)] - ny[r] };
        try place(mapped, edit.rows, edit.columns, c, output.items.len);
        try output.append(a, .{ .source = source, .fresh = true, .cell = c });
        fresh += 1;
    };
    const ordered = try a.alloc(Output, output.items.len);
    errdefer a.free(ordered);
    var count: usize = 0;
    for (0..edit.rows) |r| for (0..edit.columns) |col| {
        const i = mapped[r * edit.columns + col];
        if (i == empty) return error.InvalidSourceSpanGrid;
        const v = output.items[i];
        if (v.cell.row != r or v.cell.column != col) continue;
        ordered[count] = v;
        count += 1;
    };
    if (count != ordered.len) return error.InvalidSourceSpanGrid;
    const output_cells = try a.alloc(Cell, ordered.len);
    defer a.free(output_cells);
    for (ordered, output_cells) |v, *cell| cell.* = v.cell;
    const proved_widths = try resolveTracks(a, output_cells, edit.columns, nx[edit.columns], false);
    defer a.free(proved_widths);
    const proved_heights = try resolveTracks(a, output_cells, edit.rows, ny[edit.rows], true);
    defer a.free(proved_heights);

    return .{ .rows = edit.rows, .columns = edit.columns, .width = nx[edit.columns], .height = ny[edit.rows], .cells = ordered, .inserted_count = fresh };
}

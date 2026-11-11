//! Scratch-arena geometry for one source cell. Existing physical boundaries are
//! retained; unconstrained internal tracks are interpolated deterministically.
const std = @import("std");
const Cell = @import("../body/table_cell.zig").Cell;
const split = @import("source_table_cell_split.zig");
const builtin = @import("builtin");
pub const Work = if (builtin.is_test) struct {
    source_cells: usize = 0,
    old_slots: usize = 0,
    links: usize = 0,
    link_visits: usize = 0,
    merged_edges: usize = 0,
    output_slots: usize = 0,
    emitted_cells: usize = 0,
    id_records: usize = 0,
} else void;
pub const Testing = if (builtin.is_test) struct {
    pub threadlocal var active: ?*Work = null;
} else struct {};
pub fn observe(comptime field: []const u8, count: usize) void {
    if (builtin.is_test) if (Testing.active) |work| {
        @field(work, field) += count;
    };
}
const Link = struct { end: usize, delta: i64 };
fn connect(a: std.mem.Allocator, links: []std.ArrayList(Link), start: usize, end: usize, size: u32) !void {
    try links[start].append(a, .{ .end = end, .delta = size });
    try links[end].append(a, .{ .end = start, .delta = -@as(i64, size) });
    observe("links", 2);
}
pub fn axis(a: std.mem.Allocator, cells: []const Cell, count: u32, horizontal: bool) ![]u32 {
    const links = try a.alloc(std.ArrayList(Link), @as(usize, count) + 1);
    @memset(links, .empty);
    for (cells) |cell| {
        const start = if (horizontal) cell.column else cell.row;
        const span = if (horizontal) cell.column_span else cell.row_span;
        try connect(a, links, start, @as(usize, start) + span, if (horizontal) cell.width else cell.height);
    }
    const values = try a.alloc(?i64, links.len);
    @memset(values, null);
    values[0] = 0;
    const queue = try a.alloc(usize, links.len);
    queue[0] = 0;
    var read: usize = 0;
    var written: usize = 1;
    while (read < written) : (read += 1) {
        const from = queue[read];
        for (links[from].items) |link| {
            observe("link_visits", 1);
            const value = values[from].? + link.delta;
            if (value < 0 or value > std.math.maxInt(u32)) return error.UnsupportedSourceTableSplitGeometry;
            if (values[link.end]) |known| {
                if (known != value) return error.UnsupportedSourceTableSplitGeometry;
            } else {
                values[link.end] = value;
                queue[written] = link.end;
                written += 1;
            }
        }
    }
    // Split preserves all actual cell extents. The object header declaration is
    // independent (e.g. after supported setCellSizes); never use it as a grid
    // equation and never normalize it while writing a subdivision.
    const extent = values[count] orelse return error.UnsupportedSourceTableSplitGeometry;
    if (extent < count) return error.UnsupportedSourceTableSplitGeometry;
    const result = try a.alloc(u32, links.len);
    result[0] = 0;
    var previous: usize = 0;
    for (1..links.len) |index| {
        if (values[index]) |end| {
            const start: u32 = @intCast(values[previous].?);
            if (end <= start or end - start < index - previous) return error.UnsupportedSourceTableSplitGeometry;
            for (previous + 1..index + 1) |position| {
                result[position] = start + @as(u32, @intCast(@as(u64, @intCast(end - start)) * (position - previous) / (index - previous)));
            }
            previous = index;
        } else if (links[index].items.len != 0) return error.UnsupportedSourceTableSplitGeometry;
    }
    return result;
}
pub const Edges = struct { values: []const u32, old: []const u32, pieces: []const u32 };
pub fn refine(a: std.mem.Allocator, original: []const u32, start: usize, end: usize, parts: u32) !Edges {
    const length = original[end] - original[start];
    if (length < parts) return error.UnsupportedSourceTableSplitDimensions;
    const cuts = try a.alloc(u32, @as(usize, parts) + 1);
    cuts[0] = original[start];
    for (0..parts) |index| cuts[index + 1] = cuts[index] + try split.part(length, parts, @intCast(index));
    const combined = try a.alloc(u32, original.len + cuts.len);
    const old = try a.alloc(u32, original.len);
    const pieces = try a.alloc(u32, cuts.len);
    var left: usize = 0;
    var right: usize = 0;
    var count: u32 = 0;
    while (left < original.len or right < cuts.len) {
        const value = @min(if (left < original.len) original[left] else std.math.maxInt(u32), if (right < cuts.len) cuts[right] else std.math.maxInt(u32));
        combined[count] = value;
        if (left < original.len and original[left] == value) {
            old[left] = count;
            left += 1;
        }
        if (right < cuts.len and cuts[right] == value) {
            pieces[right] = count;
            right += 1;
        }
        count += 1;
        observe("merged_edges", 1);
    }
    return .{ .values = combined[0..count], .old = old, .pieces = pieces };
}
pub const Output = struct { template: usize, row: u32, column: u32, row_span: u32, column_span: u32, width: u32, height: u32, blank: bool };
pub const Plan = struct { rows: u32, columns: u32, starts: []?Output, row_cells: []u16 };
fn place(plan: Plan, covered: []bool, cell: Output) !void {
    if (cell.row_span == 0 or cell.column_span == 0 or cell.row + cell.row_span > plan.rows or cell.column + cell.column_span > plan.columns)
        return error.InvalidSourceTableGrid;
    for (cell.row..cell.row + cell.row_span) |row| for (cell.column..cell.column + cell.column_span) |column| {
        const index = row * plan.columns + column;
        if (covered[index]) return error.InvalidSourceTableGrid;
        covered[index] = true;
        observe("output_slots", 1);
    };
    const index = @as(usize, cell.row) * plan.columns + cell.column;
    if (plan.starts[index] != null) return error.InvalidSourceTableGrid;
    plan.starts[index] = cell;
    plan.row_cells[cell.row] += 1;
}
pub fn create(a: std.mem.Allocator, cells: []const Cell, rows: u32, columns: u32, width: u32, height: u32, selected: usize, request: split.Request, limit: usize) !Plan {
    // Keep the existing positive declared-extent admission. Its bytes remain
    // owned by the untouched control header, independently of cell sums.
    if (width == 0 or height == 0) return error.UnsupportedSourceTableSplitGeometry;
    const x = try axis(a, cells, columns, true);
    const y = try axis(a, cells, rows, false);
    const cell = cells[selected];
    const next_x = try refine(a, x, cell.column, @as(usize, cell.column) + cell.column_span, request.columns);
    const next_y = try refine(a, y, cell.row, @as(usize, cell.row) + cell.row_span, request.rows);
    const nr = next_y.values.len - 1;
    const nc = next_x.values.len - 1;
    const count = try std.math.mul(usize, nr, nc);
    if (nr > 65535 or nc > 65535 or count > limit) return error.LimitExceeded;
    const plan: Plan = .{ .rows = @intCast(nr), .columns = @intCast(nc), .starts = try a.alloc(?Output, count), .row_cells = try a.alloc(u16, nr) };
    @memset(plan.starts, null);
    @memset(plan.row_cells, 0);
    const covered = try a.alloc(bool, count);
    @memset(covered, false);
    for (cells, 0..) |prior, index| {
        if (index == selected) continue;
        const row = next_y.old[prior.row];
        const column = next_x.old[prior.column];
        try place(plan, covered, .{ .template = index, .row = row, .column = column, .row_span = next_y.old[@as(usize, prior.row) + prior.row_span] - row, .column_span = next_x.old[@as(usize, prior.column) + prior.column_span] - column, .width = prior.width, .height = prior.height, .blank = false });
    }
    for (0..request.rows) |row| for (0..request.columns) |column| {
        const top = next_y.pieces[row];
        const left = next_x.pieces[column];
        const bottom = next_y.pieces[row + 1];
        const right = next_x.pieces[column + 1];
        try place(plan, covered, .{ .template = selected, .row = top, .column = left, .row_span = bottom - top, .column_span = right - left, .width = next_x.values[right] - next_x.values[left], .height = next_y.values[bottom] - next_y.values[top], .blank = row != 0 or column != 0 });
    };
    for (covered) |present| if (!present) return error.InvalidSourceTableGrid;
    return plan;
}

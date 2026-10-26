//! Rectangular cell layout; source order stays intact, placement is separate.
const std = @import("std");
const m = @import("layout_metrics.zig");
pub const Kind = @import("grid_types.zig").Kind;
pub const Cell = struct { box: m.Box, empty: bool };
pub const Parameters = struct { column_gap: f64, row_gap: f64, padding: f64, thickness: f64, axis: f64, minimum_row_height: f64 = 0 };
pub const Result = struct {
    allocator: std.mem.Allocator,
    box: m.Box,
    cells: []m.Placement,
    rectangles: []m.Rectangle,
    pub fn deinit(self: *Result) void {
        self.allocator.free(self.cells);
        self.allocator.free(self.rectangles);
        self.* = undefined;
    }
};
fn column(index: usize, rows: usize, columns: usize, kind: Kind) usize {
    const col = index % columns;
    if (kind == .ladder and index / columns == rows - 1) return if (col == columns - 1) 0 else col + 1;
    return col;
}
pub fn place(a: std.mem.Allocator, cells: []const Cell, rows: usize, columns: usize, kind: Kind, p: Parameters, limits: m.Limits) !Result {
    try m.validateLimits(limits);
    if (rows == 0 or columns == 0) return error.InvalidEquationGridLayout;
    if (rows > 65536 or columns > 65536 or cells.len > 65536) return error.EquationLayoutLimitExceeded;
    if ((std.math.mul(usize, rows, columns) catch return error.EquationLayoutLimitExceeded) != cells.len) return error.InvalidEquationGridLayout;
    if (kind == .sladder) return error.UnsupportedEquationGridLayout;
    for ([_]f64{ p.column_gap, p.row_gap, p.padding, p.thickness, p.axis, p.minimum_row_height }) |value| try m.dimension(value, limits);
    const pile = @import("grid_types.zig").isPile(kind);
    const preserve_empty = @import("grid_types.zig").preservesEmptyRows(kind);
    if (pile and columns != 1 or preserve_empty and p.minimum_row_height == 0) return error.UnsupportedEquationGridLayout;
    if (kind == .ladder and (rows < 2 or columns < 2 or !cells[cells.len - 1].empty or p.thickness == 0 or p.row_gap < p.thickness or p.column_gap < p.thickness)) return error.UnsupportedEquationGridLayout;
    const widths = try a.alloc(f64, columns);
    defer a.free(widths);
    @memset(widths, 0);
    const ascents = try a.alloc(f64, rows);
    defer a.free(ascents);
    @memset(ascents, 0);
    const descents = try a.alloc(f64, rows);
    defer a.free(descents);
    @memset(descents, 0);
    for (cells, 0..) |cell, i| {
        try m.validate(cell.box, limits);
        if (cell.empty and (cell.box.width != 0 or cell.box.ascent != 0 or cell.box.descent != 0)) return error.InvalidEquationGridLayout;
        const col = column(i, rows, columns, kind);
        widths[col] = @max(widths[col], cell.box.width);
        ascents[i / columns] = @max(ascents[i / columns], cell.box.ascent);
        descents[i / columns] = @max(descents[i / columns], cell.box.descent);
    }
    if (preserve_empty) for (0..rows) |row| {
        const extra = @max(0, p.minimum_row_height - ascents[row] - descents[row]);
        ascents[row] += extra * 0.8;
        descents[row] += extra * 0.2;
    };
    const starts = try a.alloc(f64, columns);
    defer a.free(starts);
    var width = p.padding;
    for (widths, 0..) |w, i| {
        starts[i] = width;
        width += w;
        if (i + 1 < columns) width += p.column_gap;
        try m.dimension(width, limits);
    }
    width += p.padding;
    const baselines = try a.alloc(f64, rows);
    defer a.free(baselines);
    baselines[0] = 0;
    for (1..rows) |row| {
        baselines[row] = baselines[row - 1] + descents[row - 1] + p.row_gap + ascents[row];
        try m.dimension(baselines[row], limits);
    }
    const bottom = baselines[rows - 1] + descents[rows - 1];
    const shift = if (kind != .ladder) -(bottom - ascents[0]) / 2 - p.axis else 0;
    const placements = try a.alloc(m.Placement, cells.len);
    errdefer a.free(placements);
    for (cells, 0..) |cell, i| {
        const col = column(i, rows, columns, kind);
        const alignment: f64 = if (kind == .lpile or kind == .cases) 0 else if (kind == .rpile) 1 else if (kind == .eqalign) (if (col % 2 == 0) @as(f64, 1) else 0) else 0.5;
        placements[i] = .{ .box = cell.box, .x = starts[col] + (widths[col] - cell.box.width) * alignment, .baseline = baselines[i / columns] + shift };
        // Include both floating-point association orders of centered advances.
        width = @max(width, placements[i].x + cell.box.width + p.padding);
    }
    var box = try m.envelope(width, placements, limits);
    if (preserve_empty) {
        box.ascent = @max(box.ascent, ascents[0] - shift);
        box.descent = @max(box.descent, bottom + shift);
    }
    const rectangles = try a.alloc(m.Rectangle, if (kind == .ladder) rows else 0);
    errdefer a.free(rectangles);
    if (kind == .ladder) {
        const divider = starts[1] - p.column_gap / 2;
        const left = divider - p.thickness / 2;
        for (0..rows - 1) |row| {
            const y = baselines[row] + descents[row] + p.row_gap / 2 - p.thickness / 2;
            rectangles[row] = .{ .x = left, .y = y, .width = width - p.padding - left, .height = p.thickness };
        }
        const end = rectangles[rows - 2].y + p.thickness;
        rectangles[rows - 1] = .{ .x = left, .y = -ascents[0], .width = p.thickness, .height = end + ascents[0] };
        for (rectangles) |rect| {
            // Include the actual painted rectangle endpoints, including their
            // floating-point association order, rather than weakening bounds.
            try m.includeRectangle(&box, rect, limits);
        }
    }
    try m.validate(box, limits);
    return .{ .allocator = a, .box = box, .cells = placements, .rectangles = rectangles };
}

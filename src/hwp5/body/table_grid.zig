const std = @import("std");
const Rows = @import("table.zig").Rows;
pub const Rectangle = struct {
    row: u16,
    column: u16,
    row_span: u16,
    column_span: u16,
    pub fn validate(self: Rectangle, rows: u16, columns: u16) !void {
        if (self.row_span == 0 or self.column_span == 0 or self.row >= rows or self.column >= columns or
            self.row_span > rows - self.row or self.column_span > columns - self.column) return error.InvalidCellSpan;
    }
};
const Event = struct { row: u32, left: u16, right: u32, delta: i8 };
fn before(_: void, a: Event, b: Event) bool {
    return a.row < b.row or (a.row == b.row and a.delta < b.delta);
}
/// Range-add/range-sum Fenwick pair, indexed by columns rather than grid cells.
const Coverage = struct {
    values: []i64,
    weights: []i64,
    fn addTo(tree: []i64, index: usize, delta: i64) void {
        var i = index;
        while (i < tree.len) : (i += i & (~i +% 1)) tree[i] += delta;
    }
    fn sum(tree: []const i64, index: usize) i64 {
        var i = index;
        var result: i64 = 0;
        while (i > 0) : (i &= i - 1) result += tree[i];
        return result;
    }
    fn prefix(self: Coverage, index: usize) i64 {
        return sum(self.values, index) * @as(i64, @intCast(index)) - sum(self.weights, index);
    }
    fn occupied(self: Coverage, left: usize, right: usize) bool {
        return self.prefix(right) - self.prefix(left) != 0;
    }
    fn add(self: Coverage, left: usize, right: usize, delta: i64) void {
        addTo(self.values, left + 1, delta);
        addTo(self.values, right + 1, -delta);
        addTo(self.weights, left + 1, delta * @as(i64, @intCast(left)));
        addTo(self.weights, right + 1, -delta * @as(i64, @intCast(right)));
    }
};
/// Half-open rectangles; removals precede additions at a shared row boundary.
/// O(rows + columns + cells log cells + cells log columns) time;
/// O(cells + rows + columns) memory, including initialization and row checks.
pub fn validate(a: std.mem.Allocator, row_count: u16, column_count: u16, rows: Rows, cells: []const Rectangle) !void {
    if (row_count == 0 or column_count == 0) return error.InvalidTableDimensions;
    if (rows.count() != row_count) return error.InvalidTableRowCount;
    const starts = try a.alloc(u16, row_count);
    defer a.free(starts);
    @memset(starts, 0);
    const event_count = std.math.mul(usize, cells.len, 2) catch return error.TooManyTableCells;
    const events = try a.alloc(Event, event_count);
    defer a.free(events);
    var area: u64 = 0;
    for (cells, 0..) |c, i| {
        try c.validate(row_count, column_count);
        if (starts[c.row] >= rows.get(c.row).?.size) return error.TableRowCellCountMismatch;
        starts[c.row] += 1;
        const right = @as(u32, c.column) + c.column_span;
        events[i * 2] = .{ .row = c.row, .left = c.column, .right = right, .delta = 1 };
        events[i * 2 + 1] = .{ .row = @as(u32, c.row) + c.row_span, .left = c.column, .right = right, .delta = -1 };
        area = std.math.add(u64, area, @as(u64, c.row_span) * c.column_span) catch return error.TooManyTableCells;
    }
    for (starts, 0..) |n, i| if (n != rows.get(i).?.size) return error.TableRowCellCountMismatch;
    std.mem.sort(Event, events, {}, before);
    const size = @as(usize, column_count) + 2;
    const values = try a.alloc(i64, size);
    defer a.free(values);
    const weights = try a.alloc(i64, size);
    defer a.free(weights);
    @memset(values, 0);
    @memset(weights, 0);
    const coverage: Coverage = .{ .values = values, .weights = weights };
    for (events) |e| {
        if (e.delta > 0 and coverage.occupied(e.left, e.right)) return error.OverlappingTableCells;
        coverage.add(e.left, e.right, e.delta);
    }
    // Only after non-overlap: equal area then proves complete coverage in bounds.
    if (area != @as(u64, row_count) * column_count) return error.IncompleteTableGrid;
}

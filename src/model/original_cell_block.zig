//! Native counterpart of the existing Core SourceTableCellBlockWitness.
//! Coordinates describe a claimed selection; only source owners can authorize it.
const std = @import("std");
pub const max_cells = @import("cell_edit_budget.zig").max_cells;
pub const Rectangle = struct { top: u32, left: u32, bottom: u32, right: u32 };
pub const Cell = struct {
    list_node: u32,
    row: u32,
    column: u32,
    row_span: u32,
    column_span: u32,
    paragraphs: []const u32,
};
pub const Witness = struct { list_node: u32, row: u32, column: u32, paragraphs: []const u32 };
pub const Selection = struct { rows: u32, columns: u32, rectangle: Rectangle, cells: []const Witness };
/// Stable source-order UNIQUE physical owner indices. A merged cell's slots
/// resolve once; transport duplicate owners, partial spans and forged extents fail.
pub fn validate(a: std.mem.Allocator, cells: []const Cell, selection: Selection) ![]usize {
    const rows = selection.rows;
    const columns = selection.columns;
    const count = @as(u64, rows) * columns;
    if (rows == 0 or columns == 0 or count > max_cells or cells.len == 0 or cells.len > count or selection.cells.len == 0 or selection.cells.len > cells.len) return error.InvalidOriginalCellBlock;
    const r = selection.rectangle;
    if (r.top >= r.bottom or r.left >= r.right or r.bottom > rows or r.right > columns) return error.InvalidOriginalCellBlock;
    const empty = std.math.maxInt(usize);
    const slots = try a.alloc(usize, @intCast(count));
    defer a.free(slots);
    @memset(slots, empty);
    var owners: std.AutoHashMap(u32, usize) = .init(a);
    defer owners.deinit();
    for (cells, 0..) |cell, index| {
        if (cell.row_span == 0 or cell.column_span == 0 or cell.row >= rows or cell.column >= columns or cell.row_span > rows - cell.row or cell.column_span > columns - cell.column) return error.InvalidOriginalCellBlock;
        const slot = try owners.getOrPut(cell.list_node);
        if (slot.found_existing) return error.AmbiguousCellDisplayOwner;
        slot.value_ptr.* = index;
        for (cell.row..cell.row + cell.row_span) |row| for (cell.column..cell.column + cell.column_span) |column| {
            const at = row * columns + column;
            if (slots[at] != empty) return error.OverlappingOriginalCellBlock;
            slots[at] = index;
        };
    }
    for (slots) |index| if (index == empty) return error.InvalidOriginalCellBlock;
    const selected = try a.alloc(bool, cells.len);
    defer a.free(selected);
    @memset(selected, false);
    var expected: usize = 0;
    for (r.top..r.bottom) |row| for (r.left..r.right) |column| {
        const index = slots[row * columns + column];
        const cell = cells[index];
        if (cell.row < r.top or cell.column < r.left or cell.row_span > r.bottom - cell.row or cell.column_span > r.right - cell.column) return error.PartialMergedCellBlock;
        if (!selected[index]) {
            selected[index] = true;
            expected += 1;
        }
    };
    if (expected != selection.cells.len) return error.OriginalCellBlockOwnerMismatch;
    const witnessed = try a.alloc(bool, cells.len);
    defer a.free(witnessed);
    @memset(witnessed, false);
    var paragraph_owners: std.AutoHashMap(u32, void) = .init(a);
    defer paragraph_owners.deinit();
    for (selection.cells) |witness| {
        const index = owners.get(witness.list_node) orelse return error.OriginalCellBlockOwnerMismatch;
        if (!selected[index] or witnessed[index]) return error.OriginalCellBlockOwnerMismatch;
        witnessed[index] = true;
        const cell = cells[index];
        if (witness.row != cell.row or witness.column != cell.column or cell.paragraphs.len == 0 or !std.mem.eql(u32, witness.paragraphs, cell.paragraphs)) return error.OriginalCellBlockOwnerMismatch;
        for (cell.paragraphs) |paragraph| if ((try paragraph_owners.getOrPut(paragraph)).found_existing) return error.AmbiguousCellDisplayOwner;
    }
    const result = try a.alloc(usize, expected);
    var next: usize = 0;
    for (selected, 0..) |yes, index| if (yes) {
        result[next] = index;
        next += 1;
    };
    return result;
}

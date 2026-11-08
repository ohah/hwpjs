//! Initial text for a newly owned, detached HWP5 table. Never stages, clones,
//! serializes, or mutates a session; the existing stage_table command commits once.
const std = @import("std");
const Table = @import("../../model/created_table.zig").Table;
pub const Grid = []const []const []const u8;
pub const max_request_bytes: usize = 4 * 1024 * 1024;
pub const max_cells: usize = 4096;

pub fn validateTexts(rows: u32, columns: u32, texts: Grid, max_bytes: usize) !void {
    if (rows == 0 or columns == 0 or @as(u64, rows) * columns > max_cells) return error.LimitExceeded;
    if (texts.len != rows) return error.InvalidTableCellTexts;
    var total: usize = 0;
    for (texts) |row| {
        if (row.len != columns) return error.InvalidTableCellTexts;
        for (row) |text| {
            total = std.math.add(usize, total, text.len) catch return error.LimitExceeded;
            if (total > @min(max_bytes, max_request_bytes)) return error.LimitExceeded;
            if (!std.unicode.utf8ValidateSlice(text)) return error.InvalidTableCellText;
            for (text) |byte| if (byte < 0x20 or byte == 0x7f) return error.InvalidTableCellText;
        }
    }
}

/// Caller must own this fresh candidate and deinit it on error, including OOM.
/// Validate the entire grid before the first replacement. O(cells + UTF-8 bytes),
/// no per-cell candidate clone/save and no set_created_cell_text transaction loop.
pub fn populate(a: std.mem.Allocator, table: *Table, texts: Grid, max_bytes: usize) !void {
    try validateTexts(table.plan.rows, table.plan.columns, texts, max_bytes);
    if (table.cells.len != @as(usize, table.plan.rows) * table.plan.columns) return error.InvalidTableCellTexts;
    for (texts, 0..) |row, row_index| {
        for (row, 0..) |text, column_index| {
            _ = try table.replaceText(a, @intCast(row_index), @intCast(column_index), text, max_bytes);
        }
    }
}

/// Enforce actual JSON strings, not Zig's alternate []u8 byte-array decoding.
/// Omitted cell_texts keeps old blank requests compatible; explicit null does not.
/// The owning Request parser separately checks all other fields and dimensions.
pub fn validateWire(a: std.mem.Allocator, bytes: []const u8) !void {
    if (bytes.len > max_request_bytes) return error.LimitExceeded;
    try @import("../../model/created_table_initial_text_json.zig").validate(a, bytes, false);
}

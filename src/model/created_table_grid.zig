//! Transactional edits of owned, newly created rectangular tables only.
//! HWP5 tables 75/80 and OWPML TableType/cellAddr/cellSpan distinguish
//! dimensions, addresses and spans. This model has unit spans only; it does
//! not infer an editing policy for original/merged tables or wire limits.
//! Field references (no external code copied):
//! - legacy/rust/documents/docs/spec/hwp-5.0.md, tables 75 and 80.
//! - reference/rhwp/mydocs/manual/OWPML SCHEMA/ParaList XML schema.xml,
//!   TableType (2024 namespace): rowCnt/colCnt, cellAddr/cellSpan/cellSz.
//! Schema field comparison does not enable a new serialization profile.
const std = @import("std");
const created = @import("created_table.zig");
const creation = @import("table_creation_plan.zig");
pub const Table = created.Table;
pub const Command = union(enum) {
    insert_row: u32,
    delete_row: u32,
    insert_column: u32,
    delete_column: u32,
};
pub const Limits = struct {
    max_cells: usize,
    /// Total source UTF-8 bytes, including cells that will be deleted.
    /// Zero is a valid budget for empty text; max_cells must be positive.
    max_text_bytes: usize,
};

/// Returns an independently owned candidate; source is borrowed and never
/// mutated, including on OOM. Caller owns publication/document-wide ID choice.
/// New IDs are in inserted row/column order and cannot reuse any source ID.
/// Expected O(source cells + candidate cells + source text bytes), with a
/// single destination mapping pass and O(source + new cells) temporary IDs.
pub fn edit(a: std.mem.Allocator, source: *const Table, command: Command, new_paragraph_ids: []const u32, limits: Limits) !Table {
    if (limits.max_cells == 0) return error.InvalidTableGridLimits;
    if (source.identity == 0 or source.instance_id == 0) return error.InvalidCreatedTableIdentity;
    const old = source.plan;
    _ = try creation.create(old.rows, old.columns, old.width, old.row_height, limits.max_cells);
    const old_count = try std.math.mul(usize, old.rows, old.columns);
    if (source.cells.len != old_count) return error.InvalidTableCell;

    const row_edit = switch (command) {
        .insert_row, .delete_row => true,
        else => false,
    };
    const insertion = switch (command) {
        .insert_row, .insert_column => true,
        else => false,
    };
    const index = switch (command) {
        inline else => |value| value,
    };
    const dimension = if (row_edit) old.rows else old.columns;
    if (index > dimension or (!insertion and (index == dimension or dimension == 1))) return error.InvalidTableGridEdit;
    const next_dimension = if (insertion) try std.math.add(u32, dimension, 1) else dimension - 1;
    // Generated-table policy, not a file-format requirement: keep total width
    // and uniform row height. Plan repartitions width with positive columns.
    const plan = try creation.create(if (row_edit) next_dimension else old.rows, if (row_edit) old.columns else next_dimension, old.width, old.row_height, limits.max_cells);
    const count = try std.math.mul(usize, plan.rows, plan.columns);
    _ = try std.math.mul(usize, count, @sizeOf(created.Cell));
    const new_count: usize = if (!insertion) 0 else if (row_edit) old.columns else old.rows;
    if (new_paragraph_ids.len != new_count) return error.InvalidTableParagraphIds;

    var ids: std.AutoHashMap(u32, void) = .init(a);
    defer ids.deinit();
    var bytes: usize = 0;
    for (source.cells) |cell| {
        if (cell.paragraph_id == 0) return error.InvalidTableParagraphIds;
        if ((try ids.getOrPut(cell.paragraph_id)).found_existing) return error.InvalidTableParagraphIds;
        bytes = try std.math.add(usize, bytes, cell.text.len);
        if (bytes > limits.max_text_bytes) return error.LimitExceeded;
        if (!std.unicode.utf8ValidateSlice(cell.text)) return error.InvalidTableCellText;
    }
    for (new_paragraph_ids) |id| {
        if (id == 0) return error.InvalidTableParagraphIds;
        if ((try ids.getOrPut(id)).found_existing) return error.InvalidTableParagraphIds;
    }

    const cells = try a.alloc(created.Cell, count);
    var initialized: usize = 0;
    errdefer {
        for (cells[0..initialized]) |cell| a.free(cell.text);
        a.free(cells);
    }
    var inserted: usize = 0;
    for (cells, 0..) |*target, offset| {
        const row = offset / plan.columns;
        const column = offset % plan.columns;
        const coordinate = if (row_edit) row else column;
        if (insertion and coordinate == index) {
            target.* = .{ .paragraph_id = new_paragraph_ids[inserted], .text = &.{} };
            inserted += 1;
        } else {
            const prior = if (insertion) coordinate - @intFromBool(coordinate > index) else coordinate + @intFromBool(coordinate >= index);
            const source_offset = if (row_edit) prior * old.columns + column else row * old.columns + prior;
            const cell = source.cells[source_offset];
            target.* = .{ .paragraph_id = cell.paragraph_id, .text = try a.dupe(u8, cell.text) };
        }
        initialized += 1;
    }
    var result = source.*;
    result.plan = plan;
    result.cells = cells;
    return result;
}

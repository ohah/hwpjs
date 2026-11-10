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
const edit_plan = @import("table_grid_edit_plan.zig");
pub const Command = edit_plan.Command;
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

    const mapping = try edit_plan.create(old.rows, old.columns, command, limits.max_cells);
    // Generated-table policy: retain total width and uniform row height.
    const plan = try creation.create(mapping.rows, mapping.columns, old.width, old.row_height, limits.max_cells);
    const count = try std.math.mul(usize, plan.rows, plan.columns);
    _ = try std.math.mul(usize, count, @sizeOf(created.Cell));
    const new_count = mapping.inserted_count;
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
        if (try mapping.sourceIndex(@intCast(row), @intCast(column))) |source_offset| {
            const cell = source.cells[source_offset];
            target.* = .{ .paragraph_id = cell.paragraph_id, .text = try a.dupe(u8, cell.text) };
        } else {
            target.* = .{ .paragraph_id = new_paragraph_ids[inserted], .text = &.{} };
            inserted += 1;
        }
        initialized += 1;
    }
    var result = source.*;
    result.plan = plan;
    result.cells = cells;
    return result;
}

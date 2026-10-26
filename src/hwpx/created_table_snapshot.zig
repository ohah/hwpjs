//! Detached created-object query; identities never pretend to be XML nodes.
const std = @import("std");
const editor = @import("editor_session.zig");
const common = @import("../model/created_table_snapshot.zig");
pub const Cell = common.Cell;
pub const Row = common.Row;
pub const deinit = common.deinit;
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const entries = session.sections[section_index].created_tables.entries.items;
    const rows = try a.alloc(Row, entries.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (entries, rows) |entry, *row| {
        const point = try @import("created_table_anchor.zig").resolve(a, session, entry.anchor);
        row.* = try common.fromTable(a, &entry.table, point.paragraph, point.unit);
        initialized += 1;
    }
    return rows;
}

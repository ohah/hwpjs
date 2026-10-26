//! HWP5 current host uses zero-based ordinals; retain explicit wire policy.
const std = @import("std");
const common = @import("../../model/created_table_snapshot.zig");
pub const Row = struct {
    table: common.Row,
    options: @import("created_table_records.zig").Options,
    pub fn deinit(self: *Row, a: std.mem.Allocator) void {
        a.free(self.options.common.description);
        self.table.deinit(a);
        self.* = undefined;
    }
};
pub fn deinit(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |*row| row.deinit(a);
    a.free(rows);
}
pub fn read(a: std.mem.Allocator, section: *const @import("../../model/document.zig").Section, values: *const @import("created_table_values.zig").Values) ![]Row {
    const rows = try a.alloc(Row, values.entries.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (values.entries, rows) |entry, *row| {
        const host = try @import("created_table_anchor.zig").resolve(a, section, entry.anchor);
        var table = try common.fromTable(a, &entry.value.table, host, entry.anchor.unit);
        errdefer table.deinit(a);
        var options = entry.value.options;
        options.common.description = try a.dupe(u8, options.common.description);
        row.* = .{ .table = table, .options = options };
        initialized += 1;
    }
    return rows;
}

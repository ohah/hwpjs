//! Owned scalar observations of source table pagination policy.
const std = @import("std");
const editor = @import("editor_session.zig");
const values = @import("table_pagination_values.zig");
pub const Row = struct { table_node: usize, values: values.Values };

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) ![]Row {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    var rows: std.ArrayList(Row) = .empty;
    errdefer rows.deinit(a);
    for (tree.elements, 0..) |_, node| {
        if (!@import("table_xml_fields.zig").childIs(tree, node, "tbl")) continue;
        if (rows.items.len >= 100000) return error.LimitExceeded;
        try rows.append(a, .{ .table_node = node, .values = try values.read(a, tree, node, 4096) });
    }
    return rows.toOwnedSlice(a);
}

test "HWPX table pagination snapshot actual scalar ownership and all allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            const rows = try read(allocator, source, 0);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 1), rows.len);
            try std.testing.expectEqual(@as(?values.PageBreak, .cell), rows[0].values.page_break);
            const json = try std.json.Stringify.valueAlloc(allocator, rows, .{});
            defer allocator.free(json);
        }
    }.run, .{&session});
}

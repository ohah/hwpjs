//! Bounded query identities only; commit still accepts only a Native lease/value.
const std = @import("std");
const block = @import("../model/original_cell_block.zig");
pub const max_query_bytes = 1024 * 1024;
pub const max_reply_bytes = 4 * 1024 * 1024;
pub const Query = struct {
    section: u32,
    table_node: u32,
    selection: block.Selection,
    pub fn deinit(self: *Query, a: std.mem.Allocator) void {
        for (self.selection.cells) |cell| a.free(cell.paragraphs);
        a.free(self.selection.cells);
        self.* = undefined;
    }
};
pub fn decodeQuery(a: std.mem.Allocator, bytes: []const u8) !Query {
    if (bytes.len > max_query_bytes) return error.LimitExceeded;
    const Cell = struct { listNode: u32, row: u32, column: u32, paragraphs: []u32 };
    const Wire = struct { section: u32, tableNode: u32, rows: u32, columns: u32, rectangle: block.Rectangle, cells: []Cell };
    var parsed = try std.json.parseFromSlice(Wire, a, bytes, .{});
    defer parsed.deinit();
    const value = parsed.value;
    if (value.cells.len == 0 or value.cells.len > block.max_cells or value.rows == 0 or value.columns == 0 or @as(u64, value.rows) * value.columns > block.max_cells) return error.InvalidOriginalCellBlock;
    const cells = try a.alloc(block.Witness, value.cells.len);
    var initialized: usize = 0;
    errdefer {
        for (cells[0..initialized]) |cell| a.free(cell.paragraphs);
        a.free(cells);
    }
    var seen: std.AutoHashMap(u32, void) = .init(a);
    defer seen.deinit();
    var paragraphs: usize = 0;
    for (value.cells, cells) |source, *cell| {
        paragraphs = std.math.add(usize, paragraphs, source.paragraphs.len) catch return error.LimitExceeded;
        if (source.paragraphs.len == 0 or paragraphs > 100000) return error.InvalidOriginalCellBlock;
        if ((try seen.getOrPut(source.listNode)).found_existing) return error.OriginalCellBlockOwnerMismatch;
        cell.* = .{ .list_node = source.listNode, .row = source.row, .column = source.column, .paragraphs = try a.dupe(u32, source.paragraphs) };
        initialized += 1;
    }
    return .{ .section = value.section, .table_node = value.tableNode, .selection = .{ .rows = value.rows, .columns = value.columns, .rectangle = value.rectangle, .cells = cells } };
}
pub fn observation(a: std.mem.Allocator, comptime format: enum { hwp5, hwpx }, before: anytype, lease: u64, revision: u32) ![]u8 {
    const Cell = struct { listNode: u32, row: u32, column: u32, paragraphs: []const u32, value: ?[]const u8, editable: bool };
    const cells = try a.alloc(Cell, before.entries.len);
    defer a.free(cells);
    var editable = true;
    for (before.entries, cells) |entry, *cell| {
        const native = if (format == .hwp5) entry else entry.before;
        const node = if (format == .hwp5) entry.selector.list_node else entry.before.list_node;
        if (node > std.math.maxInt(u32)) return error.LimitExceeded;
        const writable = !native.read_only and (if (format == .hwp5) native.value != null else native.raw == null or native.value != null);
        editable = editable and writable;
        cell.* = .{ .listNode = @intCast(node), .row = entry.row, .column = entry.column, .paragraphs = entry.paragraphs, .value = if (native.value) |v| @import("../model/cell_vertical_alignment.zig").text(v) else null, .editable = writable };
    }
    if (before.section > std.math.maxInt(u32) or before.table_node > std.math.maxInt(u32)) return error.LimitExceeded;
    const token = try std.fmt.allocPrint(a, "{d}", .{lease});
    defer a.free(token);
    const bytes = try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .format = @tagName(format), .section = @as(u32, @intCast(before.section)), .tableNode = @as(u32, @intCast(before.table_node)), .rows = before.rows, .columns = before.columns, .rectangle = before.rectangle, .cells = cells, .lease = token, .historyRevision = revision, .editable = editable }, .{});
    errdefer a.free(bytes);
    if (bytes.len > max_reply_bytes) return error.LimitExceeded;
    return bytes;
}

test "original cell block wire bounded identities refuse duplicate unsupported and extra before authority" {
    const a = std.testing.allocator;
    const valid = "{\"section\":0,\"tableNode\":2,\"rows\":1,\"columns\":2,\"rectangle\":{\"top\":0,\"left\":0,\"bottom\":1,\"right\":2},\"cells\":[{\"listNode\":3,\"row\":0,\"column\":0,\"paragraphs\":[1]},{\"listNode\":4,\"row\":0,\"column\":1,\"paragraphs\":[2]}]}";
    var query = try decodeQuery(a, valid);
    defer query.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), query.selection.cells.len);
    const invalid = "{\"section\":0,\"tableNode\":2,\"rows\":1,\"columns\":2,\"rectangle\":{\"top\":0,\"left\":0,\"bottom\":1,\"right\":2},\"cells\":[{\"listNode\":3,\"row\":0,\"column\":0,\"paragraphs\":[1]},{\"listNode\":3,\"row\":0,\"column\":1,\"paragraphs\":[2]}]}";
    try std.testing.expectError(error.OriginalCellBlockOwnerMismatch, decodeQuery(a, invalid));
    const oversized = try a.alloc(u8, max_query_bytes + 1);
    defer a.free(oversized);
    try std.testing.expectError(error.LimitExceeded, decodeQuery(a, oversized));
}

//! Test-only fixed record-field and matrix comparison. No production grid mapping.
const std = @import("std");
const a = std.testing.allocator;

// Read actual emitted record ordinals. Never use a hardcoded table_node or a
// fake paragraph index as the source-owner proof after reopening a new table.
pub fn onlyTableNode(bytes: []const u8) !usize {
    var source = try @import("../hwp5/text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    var it = @import("../hwp5/record.zig").Iterator.init(body, .{});
    var node: usize = 0;
    var found: ?usize = null;
    while (try it.next()) |record| : (node += 1) {
        if (record.tag != 77) continue;
        if (found != null) return error.AmbiguousModernTable;
        found = node;
    }
    return found orelse error.MissingModernTable;
}

// Independent matrix expectations below do not call the production grid plan.
// Missing PARA_TEXT is accepted only for the explicit one-CR empty paragraph
// form, not as invented text for an arbitrary missing/malformed record.
pub fn inspectSourceGrid(bytes: []const u8, rows: usize, columns: usize, matrix: []const []const u8) !void {
    try std.testing.expectEqual(rows * columns, matrix.len);
    try std.testing.expect(matrix.len <= 9);
    var source = try @import("../hwp5/text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    try std.testing.expectEqual(@as(u32, 0x05000300), source.header.version().raw);
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    var it = @import("../hwp5/record.zig").Iterator.init(body, .{});
    var table_count: usize = 0;
    var table_level: u10 = 0;
    var in_table = false;
    var cell: ?usize = null;
    var cell_count: usize = 0;
    var headers: [9]bool = @splat(false);
    var texts: [9]bool = @splat(false);
    var runs: [9]bool = @splat(false);
    var header_ends: [9]usize = @splat(0);
    var run_ends: [9]usize = @splat(0);
    while (try it.next()) |record| {
        if (in_table and record.level < table_level) {
            if (cell) |previous| if (!texts[previous]) try std.testing.expectEqual(run_ends[previous], record.offset);
            in_table = false;
            cell = null;
        }
        if (record.tag == 77) {
            table_count += 1;
            try std.testing.expectEqual(@as(usize, 1), table_count);
            const table = try @import("../hwp5/body/table.zig").Table.parse(record.payload, source.header.version());
            try std.testing.expectEqual(rows, table.row_count);
            try std.testing.expectEqual(columns, table.column_count);
            try std.testing.expectEqual(@as(usize, 0), table.extra.len);
            table_level = record.level;
            in_table = true;
            continue;
        }
        if (!in_table) continue;
        if (record.tag == 72 and record.level == table_level) {
            if (cell) |previous| if (!texts[previous]) try std.testing.expectEqual(run_ends[previous], record.offset);
            try std.testing.expect(cell_count < matrix.len);
            // Native creation selected observed8 with no extension. This is
            // the regular extra0 path, not a special 13-byte Noori extension.
            try std.testing.expectEqual(@as(usize, 34), record.payload.len);
            try std.testing.expectEqual(@as(u16, 1), std.mem.readInt(u16, record.payload[0..2], .little));
            const column = std.mem.readInt(u16, record.payload[8..10], .little);
            const row = std.mem.readInt(u16, record.payload[10..12], .little);
            try std.testing.expectEqual(cell_count % columns, column);
            try std.testing.expectEqual(cell_count / columns, row);
            try std.testing.expectEqual(@as(u16, 1), std.mem.readInt(u16, record.payload[12..14], .little));
            try std.testing.expectEqual(@as(u16, 1), std.mem.readInt(u16, record.payload[14..16], .little));
            cell = cell_count;
            cell_count += 1;
        } else if (record.tag == 66) {
            const index = cell orelse return error.MissingModernCellOwner;
            try std.testing.expect(!headers[index]);
            try std.testing.expectEqual(table_level, record.level);
            try std.testing.expectEqual(@as(usize, 22), record.payload.len);
            try std.testing.expectEqual(@as(u16, 1), std.mem.readInt(u16, record.payload[12..14], .little));
            try std.testing.expectEqual(@as(u16, 0), std.mem.readInt(u16, record.payload[16..18], .little));
            const expected = try std.unicode.utf8ToUtf16LeAlloc(a, matrix[index]);
            defer a.free(expected);
            const count = std.mem.readInt(u32, record.payload[0..4], .little) & 0x7fffffff;
            try std.testing.expectEqual(expected.len + 1, count);
            headers[index] = true;
            header_ends[index] = record.offset + record.raw.len;
        } else if (record.tag == 67) {
            const index = cell orelse return error.MissingModernCellOwner;
            try std.testing.expect(headers[index] and !texts[index] and !runs[index]);
            try std.testing.expectEqual(table_level + 1, record.level);
            const expected_text = try std.fmt.allocPrint(a, "{s}\r", .{matrix[index]});
            defer a.free(expected_text);
            const expected = try std.unicode.utf8ToUtf16LeAlloc(a, expected_text);
            defer a.free(expected);
            try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected), record.payload);
            texts[index] = true;
        } else if (record.tag == 68) {
            const index = cell orelse return error.MissingModernCellOwner;
            try std.testing.expect(headers[index] and !runs[index]);
            try std.testing.expectEqual(table_level + 1, record.level);
            try std.testing.expectEqual(@as(usize, 8), record.payload.len);
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, record.payload[0..4], .little));
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, record.payload[4..8], .little));
            if (!texts[index]) try std.testing.expectEqual(header_ends[index], record.offset);
            runs[index] = true;
            run_ends[index] = record.offset + record.raw.len;
        } else return error.UnexpectedModernTableRecord;
    }
    if (in_table) if (cell) |last| if (!texts[last]) try std.testing.expectEqual(run_ends[last], body.len);
    try std.testing.expectEqual(@as(usize, 1), table_count);
    try std.testing.expectEqual(matrix.len, cell_count);
    for (matrix, 0..) |expected, index| {
        try std.testing.expect(headers[index] and runs[index]);
        if (!texts[index]) try std.testing.expectEqual(@as(usize, 0), expected.len);
    }
}

pub fn unchangedNonBodyStreams(before_bytes: []const u8, after_bytes: []const u8) !void {
    var before = try @import("../cfb/reader.zig").File.open(a, before_bytes, .{ .strict = true });
    defer before.deinit();
    var after = try @import("../cfb/reader.zig").File.open(a, after_bytes, .{ .strict = true });
    defer after.deinit();
    for ([_][]const u8{ "/FileHeader", "/DocInfo" }) |path| {
        // readStream borrows File-owned content, so there is no stream free.
        try std.testing.expectEqualSlices(u8, try before.readStream(a, path), try after.readStream(a, path));
    }
}

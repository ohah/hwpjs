//! Current resource projection, rebuilt from source and immutable intents.
const std = @import("std");
const Row = @import("../model/character_underline_snapshot.zig").Row;
pub const FullRow = struct {
    id: u32 = 0,
    kind: ?@import("character_underline_values.zig").Kind = null,
    present: bool = false,
    shape: ?[]u8 = null,
    color: ?[]u8 = null,
};
pub fn deinit(a: std.mem.Allocator, rows: []FullRow) void {
    for (rows) |row| {
        if (row.shape) |value| a.free(value);
        if (row.color) |value| a.free(value);
    }
    a.free(rows);
}
pub fn read(session: *const @import("editor_session.zig").Session) ![]Row {
    const full = try readFull(session);
    defer deinit(session.allocator, full);
    const rows = try session.allocator.alloc(Row, full.len);
    for (full, rows) |value, *row| row.* = .{ .id = value.id, .kind = value.kind };
    return rows;
}
pub fn readFull(session: *const @import("editor_session.zig").Session) ![]FullRow {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const expected = resources.table(.char_shape).ids.items;
    const output = try a.alloc(FullRow, expected.len + session.character_resources.entries.items.len);
    @memset(output, .{});
    errdefer deinit(a, output);
    var count: usize = 0;
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(&tree, index)) continue;
        if (count == expected.len) return error.SourceBindingMismatch;
        const shape = try @import("character_shape_display.zig").read(a, &tree, index, 4096);
        var values = try @import("character_underline_values.zig").read(a, &tree, index, 4096);
        defer values.deinit(a);
        output[count] = .{ .id = shape.id orelse return error.SourceBindingMismatch, .kind = if (values.present) values.kind else .none, .present = values.present, .shape = values.shape, .color = values.color };
        values.shape = null;
        values.color = null;
        count += 1;
    }
    if (count != expected.len) return error.SourceBindingMismatch;
    std.mem.sort(FullRow, output[0..count], {}, less);
    for (output[0..count], expected) |row, id| if (row.id != id) return error.SourceBindingMismatch;
    for (session.character_resources.entries.items) |entry| {
        var low: usize = 0;
        var high = expected.len;
        while (low < high) {
            const middle = low + (high - low) / 2;
            if (output[middle].id < entry.source_id) low = middle + 1 else high = middle;
        }
        if (low == expected.len or output[low].id != entry.source_id) return error.InvalidCharacterShapeReference;
        output[count] = try derive(a, output[low], entry.id, entry.properties.underline_kind, entry.properties.underline_color);
        count += 1;
    }
    std.mem.sort(FullRow, output, {}, less);
    for (output, 0..) |row, index| if (index > 0 and row.id <= output[index - 1].id) return error.DuplicateCharacterResourceId;
    return output;
}
fn less(_: void, left: FullRow, right: FullRow) bool {
    return left.id < right.id;
}
fn derive(a: std.mem.Allocator, source: FullRow, id: u32, kind: ?@import("character_underline_values.zig").Kind, color: ?u32) !FullRow {
    var row: FullRow = .{ .id = id, .kind = kind orelse source.kind, .present = source.present };
    errdefer {
        if (row.shape) |value| a.free(value);
        if (row.color) |value| a.free(value);
    }
    const create = !source.present and (color != null or (kind != null and kind.? != .none));
    if (create) {
        row.shape = try a.dupe(u8, @import("character_underline_patch.zig").creation_shape);
        row.present = true;
    } else {
        if (source.shape) |value| row.shape = try a.dupe(u8, value);
    }
    if (color) |value| row.color = try @import("../model/rgb_color.zig").format(a, value) else if (create) {
        row.color = try a.dupe(u8, @import("character_underline_patch.zig").creation_color);
    } else if (source.color) |value| row.color = try a.dupe(u8, value);
    return row;
}

test "HWPX underline snapshot derived strings survive all allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const rows = try allocator.alloc(FullRow, 5);
            @memset(rows, .{});
            defer deinit(allocator, rows);
            const shape = try allocator.dupe(u8, "WAVE");
            defer allocator.free(shape);
            const color = try allocator.dupe(u8, "#123456");
            defer allocator.free(color);
            rows[0] = try derive(allocator, .{ .id = 9, .kind = .top, .present = true, .shape = shape, .color = color }, 10, .none, null);
            rows[1] = try derive(allocator, .{ .id = 9, .kind = .none }, 11, .center, null);
            rows[2] = try derive(allocator, .{ .id = 9, .kind = .none }, 12, .none, null);
            rows[3] = try derive(allocator, .{ .id = 9, .kind = .top, .present = true, .shape = shape, .color = color }, 13, null, 0xff0000);
            rows[4] = try derive(allocator, .{ .id = 9, .kind = .none }, 14, null, 0);
            try std.testing.expectEqualStrings("WAVE", rows[0].shape.?);
            try std.testing.expectEqualStrings("#123456", rows[0].color.?);
            try std.testing.expect(rows[0].shape.?.ptr != shape.ptr);
            try std.testing.expectEqualStrings("SOLID", rows[1].shape.?);
            try std.testing.expectEqualStrings("#000000", rows[1].color.?);
            try std.testing.expect(!rows[2].present and rows[2].shape == null and rows[2].color == null);
            try std.testing.expectEqualStrings("WAVE", rows[3].shape.?);
            try std.testing.expectEqualStrings("#ff0000", rows[3].color.?);
            try std.testing.expectEqual(@import("character_underline_values.zig").Kind.top, rows[3].kind.?);
            try std.testing.expect(rows[4].present);
            try std.testing.expectEqual(@import("character_underline_values.zig").Kind.none, rows[4].kind.?);
            try std.testing.expectEqualStrings("SOLID", rows[4].shape.?);
            try std.testing.expectEqualStrings("#000000", rows[4].color.?);
        }
    }.run, .{});
}

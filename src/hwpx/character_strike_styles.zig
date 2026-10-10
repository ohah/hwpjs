//! Read current serialized header styles without caching or publishing edits.
const std = @import("std");
pub const Row = @import("../model/character_strike_snapshot.zig").StyleRow;
pub fn deinit(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |row| {
        if (row.shape) |value| a.free(value);
        if (row.color) |value| a.free(value);
    }
    a.free(rows);
}
pub fn read(session: *const @import("editor_session.zig").Session) ![]Row {
    const a = session.allocator;
    const expected = try @import("character_style_resources.zig").ids(session);
    defer a.free(expected);
    const header = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
    defer a.free(header.bytes);
    var tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    defer tree.deinit(a);
    return collect(a, &tree, expected);
}
fn collect(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, expected: []const u32) ![]Row {
    const rows = try a.alloc(Row, expected.len);
    for (rows) |*row| row.* = .{ .id = 0 };
    errdefer deinit(a, rows);
    var count: usize = 0;
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        if (count == rows.len) return error.SourceBindingMismatch;
        const shape = try @import("character_shape_display.zig").read(a, tree, index, 4096);
        rows[count].id = shape.id orelse return error.SourceBindingMismatch;
        if (try @import("character_strike_values.zig").read(a, tree, index, 4096)) |value| {
            rows[count].shape = value.shape;
            rows[count].color = value.color;
        }
        count += 1;
    }
    if (count != rows.len) return error.SourceBindingMismatch;
    std.mem.sort(Row, rows, {}, struct {
        fn less(_: void, left: Row, right: Row) bool {
            return left.id < right.id;
        }
    }.less);
    for (rows, expected) |row, id| if (row.id != id) return error.SourceBindingMismatch;
    return rows;
}

test "HWPX strike styles own strings preserve unknown and survive allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:refList><h:charProperties><h:charPr id='9'><h:strikeout shape='FUTURE' color='unknown'/></h:charPr><h:charPr id='7'><f:strikeout shape='DOT'/></h:charPr><h:charPr id='8'><h:strikeout shape='D&#79;T' color='#123456'/></h:charPr></h:charProperties></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree) !void {
            const rows = try collect(allocator, parsed, &.{ 7, 8, 9 });
            defer deinit(allocator, rows);
            try std.testing.expectEqual(@as(?[]const u8, null), rows[0].shape);
            try std.testing.expectEqualStrings("DOT", rows[1].shape.?);
            try std.testing.expectEqualStrings("#123456", rows[1].color.?);
            try std.testing.expectEqualStrings("FUTURE", rows[2].shape.?);
            try std.testing.expectEqualStrings("unknown", rows[2].color.?);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, &.{ 7, 8 }));
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, &.{ 7, 8, 10 }));
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, &.{ 7, 8, 9, 10 }));
    const owned = block: {
        var temporary = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
        defer temporary.deinit(a);
        break :block try collect(a, &temporary, &.{ 7, 8, 9 });
    };
    defer deinit(a, owned);
    try std.testing.expectEqualStrings("DOT", owned[1].shape.?);
    try std.testing.expectEqualStrings("#123456", owned[1].color.?);
    try std.testing.expectEqualStrings("FUTURE", owned[2].shape.?);
}

//! Ordered owned font resources; IDs are scoped by language, not list position.
const std = @import("std");
const values = @import("font_face_values.zig");
pub const deinit = @import("../model/font_face_value.zig").deinit;
pub fn collect(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, max_fonts: usize, attribute_limit: usize) ![]values.Value {
    return collectRows(values.Value, a, tree, max_fonts, attribute_limit);
}
pub fn collectMetadata(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, max_fonts: usize, attribute_limit: usize) ![]@import("font_face_metadata.zig").Value {
    return collectRows(@import("font_face_metadata.zig").Value, a, tree, max_fonts, attribute_limit);
}
fn collectRows(comptime Row: type, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, max_fonts: usize, attribute_limit: usize) ![]Row {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    var rows: std.ArrayList(Row) = .empty;
    errdefer {
        for (rows.items) |*row| row.deinit(a);
        rows.deinit(a);
    }
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").head_uri, "font")) continue;
        const reader = if (Row == values.Value) values else @import("font_face_metadata.zig");
        var row = reader.read(a, tree, node, attribute_limit) catch |err| {
            if (err == error.InvalidFontResourceElement) continue;
            return err;
        };
        if (rows.items.len >= max_fonts) {
            row.deinit(a);
            return error.LimitExceeded;
        }
        rows.append(a, row) catch |err| {
            row.deinit(a);
            return err;
        };
    }
    std.mem.sort(Row, rows.items, {}, struct {
        fn less(_: void, left: Row, right: Row) bool {
            if (left.language != right.language) return @intFromEnum(left.language) < @intFromEnum(right.language);
            return left.id < right.id;
        }
    }.less);
    for (rows.items, 0..) |row, index| {
        if (index > 0 and row.language == rows.items[index - 1].language and row.id == rows.items[index - 1].id) return error.DuplicateFontId;
    }
    return rows.toOwnedSlice(a);
}

test "font face snapshot sorts sparse IDs and releases names on every failure" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface lang='LATIN'><h:font id='9' face='Latin'/></h:fontface><h:fontface lang='HANGUL'><h:font id='7' face='Seven'/><h:font id='0'/></h:fontface></h:fontfaces></h:refList><h:font id='0' face='Outside'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree) !void {
            const rows = try collect(allocator, source, 3, 64);
            defer deinit(allocator, rows);
            try std.testing.expectEqual(@as(usize, 3), rows.len);
            try std.testing.expectEqual(@as(u32, 0), rows[0].id);
            try std.testing.expect(rows[0].name == null);
            try std.testing.expectEqualStrings("Seven", rows[1].name.?);
            try std.testing.expectEqual(@import("font_faces.zig").Language.latin, rows[2].language);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, collect(a, &tree, 2, 64));
    var duplicate = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface lang='HANGUL'><h:font id='0' face='A'/><h:font id='0' face='B'/></h:fontface></h:fontfaces></h:refList></h:head>", .header, null, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicateFontId, collect(a, &duplicate, 3, 64));
}

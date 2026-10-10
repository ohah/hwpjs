//! Direct drawing text ownership and margin values, without cached layout.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");

pub const Values = struct {
    node: usize,
    list_node: ?usize,
    margin_present: bool = false,
    margins: [4]?i64 = @splat(null),
    editable: ?bool = null,
    last_width: ?u32 = null,
    text_direction: ?u32 = null,
    line_wrap: ?u32 = null,
    vertical_alignment: ?u32 = null,
};

fn child(tree: *const Tree, parent: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, parent, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateDrawingTextChild;
    return node;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, drawing: usize) !?Values {
    if (drawing >= tree.elements.len) return error.InvalidDrawingTextNode;
    const node = (try child(tree, drawing, "drawText")) orelse return null;
    var result: Values = .{ .node = node, .list_node = try child(tree, node, "subList") };
    if (result.list_node) |list| {
        const attrs = @import("para_list_attributes.zig");
        var attributes = try attrs.readTree(a, tree, list, 4096);
        defer attributes.deinit(a);
        inline for (.{ .{ attrs.Field.text_direction, "text_direction" }, .{ attrs.Field.line_wrap, "line_wrap" }, .{ attrs.Field.vert_align, "vertical_alignment" } }) |entry| {
            if (attributes.get(entry[0])) |raw| @field(result, entry[1]) = attrs.enumIndex(entry[0], raw) orelse return error.UnsupportedDrawingTextEnum;
        }
    }
    result.last_width = try fields.optionalUnsigned(a, tree, node, "lastWidth", 4096);
    if (try tree.attributeValue(a, node, "", "editable")) |raw| result.editable = try fields.boolean(a, raw, 4096);
    if (try child(tree, node, "textMargin")) |margin| {
        result.margin_present = true;
        for (fields.margin_names, 0..) |name, index| {
            if (try tree.attributeValue(a, margin, "", name)) |raw| result.margins[index] = try fields.margin(a, raw, 4096);
        }
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:rect><p:drawText editable='0' lastWidth='0'><p:subList/><p:textMargin left='-1' right='0'/></p:drawText></p:rect></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const value = (try read(a, &tree, 1)).?;
    try std.testing.expectEqual(@as(?bool, false), value.editable);
    try std.testing.expectEqual(@as(?u32, 0), value.last_width);
    try std.testing.expectEqualDeep([4]?i64{ -1, 0, null, null }, value.margins);
    try std.testing.expect(value.list_node != null);
}

test "HWPX drawing text values preserve absent margins and explicit zero with allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX drawing text values read actual multicolumn rectangle margins" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-layout.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var count: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "rect")) continue;
        const value = (try read(a, &session.sections[0].tree, node)).?;
        try std.testing.expectEqualDeep([4]?i64{ 283, 283, 283, 283 }, value.margins);
        try std.testing.expectEqual(@as(?u32, 19431), value.last_width);
        try std.testing.expectEqual(@as(?bool, false), value.editable);
        try std.testing.expectEqual(@as(?u32, 0), value.text_direction);
        try std.testing.expectEqual(@as(?u32, 0), value.line_wrap);
        try std.testing.expectEqual(@as(?u32, 1), value.vertical_alignment);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
}

test "HWPX drawing text values reject duplicate lists and ignore foreign children" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:rect>";
    var foreign = try @import("section_tree.zig").parse(a, prefix ++ "<x:drawText/></p:rect></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectEqual(@as(?Values, null), try read(a, &foreign, 1));
    try std.testing.expectError(error.InvalidDrawingTextNode, read(a, &foreign, foreign.elements.len));
    var duplicate = try @import("section_tree.zig").parse(a, prefix ++ "<p:drawText><p:subList/><p:subList/></p:drawText></p:rect></s:sec>", 0, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicateDrawingTextChild, read(a, &duplicate, 1));
    var absent = try @import("section_tree.zig").parse(a, prefix ++ "<p:drawText/></p:rect></s:sec>", 0, 0, .{});
    defer absent.deinit(a);
    const value = (try read(a, &absent, 1)).?;
    try std.testing.expect(value.editable == null and value.list_node == null and value.last_width == null);
    try std.testing.expect(!value.margin_present);
}

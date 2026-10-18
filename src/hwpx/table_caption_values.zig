//! Direct table caption source values; no inferred layout defaults.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const specs = @import("shape_xml_fields.zig").caption_specs;
const enums = @import("picture_enum_value.zig");
const list_attributes = @import("para_list_attributes.zig");

pub const Values = struct {
    caption_node: usize,
    list_node: ?usize = null,
    side: ?u32 = null,
    full_size: ?bool = null,
    width: ?i64 = null,
    gap: ?i64 = null,
    last_width: ?u32 = null,
    text_direction: ?u32 = null,
    line_wrap: ?u32 = null,
    vertical_alignment: ?u32 = null,
};

fn child(tree: *const Tree, parent: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, parent, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateTableCaptionChild;
    return node;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, table: usize) !?Values {
    if (table >= tree.elements.len or !fields.childIs(tree, table, "tbl")) return error.InvalidTableCaptionNode;
    return readComponent(a, tree, table);
}

pub fn readRectangle(a: std.mem.Allocator, tree: *const Tree, rectangle: usize) !?Values {
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidDrawingCaptionNode;
    return readComponent(a, tree, rectangle);
}

fn readComponent(a: std.mem.Allocator, tree: *const Tree, table: usize) !?Values {
    const node = (try child(tree, table, "caption")) orelse return null;
    var result = Values{ .caption_node = node, .list_node = try child(tree, node, "subList") };
    result.side = try enums.read(a, tree, node, specs[0]);
    if (try tree.attributeValue(a, node, "", specs[1].name)) |raw| result.full_size = try fields.boolean(a, raw, 4096);
    if (try tree.attributeValue(a, node, "", specs[2].name)) |raw| result.width = try fields.margin(a, raw, 4096);
    if (try tree.attributeValue(a, node, "", specs[3].name)) |raw| result.gap = try fields.margin(a, raw, 4096);
    result.last_width = try fields.optionalUnsigned(a, tree, node, specs[4].name, 4096);
    if (result.list_node) |list| {
        var attributes = try list_attributes.readTree(a, tree, list, 4096);
        defer attributes.deinit(a);
        inline for (.{ .{ list_attributes.Field.text_direction, "text_direction" }, .{ list_attributes.Field.line_wrap, "line_wrap" }, .{ list_attributes.Field.vert_align, "vertical_alignment" } }) |entry| {
            if (attributes.get(entry[0])) |raw| @field(result, entry[1]) = list_attributes.enumIndex(entry[0], raw) orelse return error.UnsupportedTableCaptionListEnum;
        }
    }
    return result;
}

test "HWPX table caption source actual values and all allocation failures" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwpx", a, .limited(4_000_000));
            defer a.free(bytes);
            var session = try @import("editor_session.zig").open(a, bytes, .{});
            defer session.deinit();
            const tree = &session.sections[0].tree;
            const sides = [_]u32{ 2, 3, 0, 1, 0, 1, 3, 3 };
            var count: usize = 0;
            for (tree.elements, 0..) |_, node| {
                if (!fields.childIs(tree, node, "tbl")) continue;
                const value = (try read(a, tree, node)).?;
                try std.testing.expectEqual(@as(?u32, sides[count]), value.side);
                try std.testing.expectEqual(@as(?bool, count == 6), value.full_size);
                try std.testing.expectEqual(@as(?i64, 8504), value.width);
                try std.testing.expectEqual(@as(?i64, 850), value.gap);
                const last: u32 = if (count == 6) 26646 else if (count >= 2 and count <= 5) 8504 else 20976;
                try std.testing.expectEqual(@as(?u32, last), value.last_width);
                try std.testing.expect(value.list_node != null);
                try std.testing.expectEqual(@as(?u32, 0), value.text_direction);
                try std.testing.expectEqual(@as(?u32, if (count == 7) 1 else 0), value.line_wrap);
                try std.testing.expectEqual(@as(?u32, if (count == 2 or count == 3) 1 else if (count == 5) 2 else 0), value.vertical_alignment);
                try std.testing.checkAllAllocationFailures(a, struct {
                    fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize, expected: Values) !void {
                        try std.testing.expectEqualDeep(expected, (try read(allocator, source, index)).?);
                    }
                }.run, .{ tree, node, value });
                count += 1;
            }
            try std.testing.expectEqual(@as(usize, 8), count);
        }
    }.run, .{});
}

test "HWPX table caption source distinguishes absence zero and duplicate children" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl/><p:tbl><p:caption width='-1' gap='0' fullSz='false'/></p:tbl><p:tbl><p:caption/><p:caption/></p:tbl><p:tbl><p:caption><p:subList/><p:subList/></p:caption></p:tbl></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?Values, null), try read(a, &tree, 1));
    const value = (try read(a, &tree, 2)).?;
    try std.testing.expectEqual(@as(?i64, -1), value.width);
    try std.testing.expectEqual(@as(?i64, 0), value.gap);
    try std.testing.expectEqual(@as(?u32, null), value.side);
    try std.testing.expectEqual(@as(?usize, null), value.list_node);
    try std.testing.expectError(error.DuplicateTableCaptionChild, read(a, &tree, 4));
    try std.testing.expectError(error.DuplicateTableCaptionChild, read(a, &tree, 7));
    try std.testing.expectError(error.InvalidTableCaptionNode, read(a, &tree, tree.elements.len));
    try std.testing.expectError(error.InvalidTableCaptionNode, read(a, &tree, 3));
    var unknown = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl><p:caption><p:subList lineWrap='FUTURE'/></p:caption></p:tbl></s:sec>", 0, 0, .{});
    defer unknown.deinit(a);
    try std.testing.expectError(error.UnsupportedTableCaptionListEnum, read(a, &unknown, 1));
}

test "HWPX table caption source rejects invalid fields and ignores foreign or nested captions" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl><x:caption/><p:other><p:caption/></p:other></p:tbl><p:tbl><p:caption width='4294967295' gap='-2147483648' lastWidth='0'/></p:tbl></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?Values, null), try read(a, &tree, 1));
    const value = (try read(a, &tree, 5)).?;
    try std.testing.expectEqual(@as(?i64, 4294967295), value.width);
    try std.testing.expectEqual(@as(?i64, -2147483648), value.gap);
    try std.testing.expectEqual(@as(?u32, 0), value.last_width);
    const errors = [_]anyerror{ error.UnsupportedPictureGeometryEnum, error.InvalidXmlBoolean, error.InvalidSignedOrUnsigned32, error.InvalidSignedOrUnsigned32, error.InvalidNonNegativeInteger };
    for ([_][]const u8{ "side='FUTURE'", "fullSz='TRUE'", "width='4294967296'", "gap='-2147483649'", "lastWidth='-1'" }, errors) |attribute, expected_error| {
        const xml = try std.fmt.allocPrint(a, "{s}<p:tbl><p:caption {s}/></p:tbl></s:sec>", .{ prefix, attribute });
        defer a.free(xml);
        var invalid = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
        defer invalid.deinit(a);
        try std.testing.expectError(expected_error, read(a, &invalid, 1));
    }
}

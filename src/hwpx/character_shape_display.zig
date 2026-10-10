//! Read-only header values; no CSS defaults, font resolution or editable cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;

pub const Shape = struct { id: ?u32, height: ?i32, bold: bool = false, italic: bool = false, effects: @import("character_effect_flags.zig").Flags = .{}, outline: ?@import("character_outline_display.zig").Value = null, text_color: ?u32 = null, shade: ?@import("../model/shade_color.zig").Value = null, font_ids: ?@import("character_font_references.zig").Values = null };

pub fn read(a: std.mem.Allocator, tree: *const Tree, index: usize, attribute_limit: usize) !Shape {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    const element = tree.elements[index];
    if (!element.is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var result: Shape = .{ .id = null, .height = null };
    result.effects = try @import("character_effect_flags.zig").read(tree, index);
    result.outline = try @import("character_outline_display.zig").read(a, tree, index, attribute_limit);
    result.font_ids = try @import("character_font_references.zig").read(a, tree, index, attribute_limit);
    if (try tree.attributeValue(a, index, "", "id")) |raw| {
        const decoded = try raw.toUtf8(a, attribute_limit);
        defer a.free(decoded);
        result.id = try @import("xml_values.zig").unsigned32(decoded);
    }
    if (try tree.attributeValue(a, index, "", "height")) |raw| {
        const decoded = try raw.toUtf8(a, attribute_limit);
        defer a.free(decoded);
        result.height = try @import("xml_values.zig").signed32(decoded);
    }
    if (try tree.attributeValue(a, index, "", "textColor")) |raw| {
        const decoded = try raw.toUtf8(a, attribute_limit);
        defer a.free(decoded);
        result.text_color = @import("../model/rgb_color.zig").xml(decoded);
    }
    var child = element.first_child;
    if (try tree.attributeValue(a, index, "", "shadeColor")) |raw| {
        const decoded = try raw.toUtf8(a, attribute_limit);
        defer a.free(decoded);
        result.shade = @import("../model/shade_color.zig").xml(decoded);
    }
    while (child) |current| : (child = tree.elements[current].next_sibling) {
        const node = tree.elements[current];
        if (node.is(uri, "bold")) {
            if (result.bold) return error.DuplicateCharacterShapeFlag;
            result.bold = true;
        } else if (node.is(uri, "italic")) {
            if (result.italic) return error.DuplicateCharacterShapeFlag;
            result.italic = true;
        }
    }
    return result;
}

test "HWPX character display values preserve absence zero namespace and signed height" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr id='&#48;' height='-1'><h:bold/><h:italic/><f:bold/></h:charPr><h:charPr/><h:charPr height='0'><f:italic/><f:holder><h:bold/></f:holder></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Shape{ .id = 0, .height = -1, .bold = true, .italic = true }, try read(a, &tree, 1, 64));
    try std.testing.expectEqualDeep(Shape{ .id = null, .height = null }, try read(a, &tree, 5, 64));
    try std.testing.expectEqualDeep(Shape{ .id = null, .height = 0 }, try read(a, &tree, 6, 64));
    try std.testing.expectError(error.InvalidElementIndex, read(a, &tree, tree.elements.len, 64));
    try std.testing.expectError(error.InvalidCharacterShapeElement, read(a, &tree, 0, 64));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            _ = try read(allocator, parsed, 1, 64);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX shade display distinguishes absent none white unknown and foreign attributes" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:future'><h:charPr/><h:charPr shadeColor='#FFFFFFFF'/><h:charPr shadeColor='#ffffff'/><h:charPr shadeColor='none'/><h:charPr f:shadeColor='#123456'/><h:charPr shadeColor='&#35;123456'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const Value = @import("../model/shade_color.zig").Value;
    try std.testing.expectEqual(@as(?Value, null), (try read(a, &tree, 1, 64)).shade);
    try std.testing.expectEqualDeep(@as(?Value, .none), (try read(a, &tree, 2, 64)).shade);
    try std.testing.expectEqualDeep(@as(?Value, .{ .color = 0xffffff }), (try read(a, &tree, 3, 64)).shade);
    try std.testing.expectEqualDeep(@as(?Value, .unknown), (try read(a, &tree, 4, 64)).shade);
    try std.testing.expectEqual(@as(?Value, null), (try read(a, &tree, 5, 64)).shade);
    try std.testing.expectEqualDeep(@as(?Value, .{ .color = 0x123456 }), (try read(a, &tree, 6, 64)).shade);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            for (1..7) |node| _ = try read(allocator, parsed, node, 64);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX character display values reject overflow duplicate flags and wrong part" {
    const a = std.testing.allocator;
    const Case = struct { body: []const u8, expected: anyerror };
    for ([_]Case{
        .{ .body = "<h:charPr height='2147483648'/>", .expected = error.InvalidXmlSigned32 },
        .{ .body = "<h:charPr id='4294967296'/>", .expected = error.InvalidUnsigned32 },
        .{ .body = "<h:charPr><h:bold/><h:bold/></h:charPr>", .expected = error.DuplicateCharacterShapeFlag },
        .{ .body = "<h:charPr><h:italic/><h:italic/></h:charPr>", .expected = error.DuplicateCharacterShapeFlag },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'>", case.body, "</h:head>" });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, read(a, &tree, 1, 64));
        tree.part_kind = .section;
        try std.testing.expectError(error.InvalidPartKind, read(a, &tree, 1, 64));
    }
}

test "HWPX character display resources match real header IDs without changing saved state" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const expected = try @import("character_style_resources.zig").ids(&session);
    defer a.free(expected);
    const shapes = try @import("character_style_resources.zig").displayShapes(&session);
    defer a.free(shapes);
    try std.testing.expectEqual(expected.len, shapes.len);
    var has_height = false;
    for (shapes, expected) |shape, id| {
        try std.testing.expectEqual(id, shape.id.?);
        has_height = has_height or shape.height != null;
    }
    try std.testing.expect(has_height);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

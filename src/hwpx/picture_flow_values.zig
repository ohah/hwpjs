//! 본문 어울림·앞뒤 순서·바깥 여백 원값입니다. 줄 배치는 계산하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const specs = @import("shape_xml_fields.zig").table_specs;
const enums = @import("picture_enum_value.zig");
pub const Values = struct {
    text_wrap: ?u32 = null,
    text_flow: ?u32 = null,
    z_order: ?i64 = null,
    outside_margins: [4]?i64 = @splat(null),
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize) !Values {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    return readComponent(a, tree, picture);
}

pub fn readContainer(a: std.mem.Allocator, tree: *const Tree, container: usize) !Values {
    if (container >= tree.elements.len or !fields.childIs(tree, container, "container")) return error.InvalidPictureContainerNode;
    return readComponent(a, tree, container);
}

pub fn readRectangle(a: std.mem.Allocator, tree: *const Tree, rectangle: usize) !Values {
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidDrawingTextNode;
    return readComponent(a, tree, rectangle);
}
pub fn readForm(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    const kind = @import("run_anchor.zig").kind(tree, node) orelse return error.InvalidFormNode;
    if (!@import("run_anchor.zig").isForm(kind)) return error.InvalidFormNode;
    return readComponent(a, tree, node);
}

pub fn readOle(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "ole")) return error.InvalidOleDisplayNode;
    return readComponent(a, tree, node);
}

fn readComponent(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    var value: Values = .{};
    value.text_wrap = try enums.readExtended(a, tree, node, specs[3]);
    value.text_flow = try enums.read(a, tree, node, specs[4]);
    if (try tree.attributeValue(a, node, "", specs[1].name)) |raw| value.z_order = try fields.margin(a, raw, 4096);
    var missing: usize = 0;
    var duplicate: usize = 0;
    const margins = fields.uniqueChild(tree, node, "outMargin", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureOutsideMargin;
    if (margins) |parent| {
        for (fields.margin_names, 0..) |name, index| {
            if (try tree.attributeValue(a, parent, "", name)) |raw| value.outside_margins[index] = try fields.margin(a, raw, 4096);
        }
    }
    return value;
}

pub fn readLine(a: std.mem.Allocator, tree: *const Tree, line: usize) !Values {
    if (line >= tree.elements.len or !fields.childIs(tree, line, "line")) return error.InvalidLineGeometryNode;
    return readComponent(a, tree, line);
}
pub fn readConnector(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "connectLine")) return error.InvalidConnectorGeometryNode;
    return readComponent(a, tree, node);
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:pic textWrap='TOP_AND_BOTTOM' textFlow='RIGHT_ONLY' zOrder='-1'><x:outMargin left='999'/><p:outMargin left='0' right='-1' bottom='4294967295'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?u32, 1), value.text_wrap);
    try std.testing.expectEqual(@as(?u32, 2), value.text_flow);
    try std.testing.expectEqual(@as(?i64, -1), value.z_order);
    try std.testing.expectEqualDeep([4]?i64{ 0, -1, null, 4294967295 }, value.outside_margins);
}

test "HWPX picture flow preserves wrap order absent margins and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture flow separates container contract and rejects duplicates and unknown wrap" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var container = try @import("section_tree.zig").parse(a, prefix ++ "<p:container textWrap='IN_FRONT_OF_TEXT'/></s:sec>", 0, 0, .{});
    defer container.deinit(a);
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &container, 1));
    try std.testing.expectEqual(@as(?u32, 3), (try readContainer(a, &container, 1)).text_wrap);
    try std.testing.expectEqualDeep([4]?i64{ null, null, null, null }, (try readContainer(a, &container, 1)).outside_margins);
    var duplicate = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic><p:outMargin/><p:outMargin/></p:pic></s:sec>", 0, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicatePictureOutsideMargin, read(a, &duplicate, 1));
    var unknown = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic textWrap='unknown'/></s:sec>", 0, 0, .{});
    defer unknown.deinit(a);
    try std.testing.expectError(error.UnsupportedPictureGeometryEnum, read(a, &unknown, 1));
    inline for (.{ .{ "TIGHT", 4 }, .{ "THROUGH", 5 } }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic textWrap='" ++ case[0] ++ "'/></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(@as(?u32, case[1]), (try read(a, &tree, 1)).text_wrap);
    }
}

test "HWPX picture flow reads actual first picture without changing saved bytes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var found = false;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        const value = try read(a, tree, node);
        try std.testing.expectEqual(@as(?u32, 0), value.text_wrap);
        try std.testing.expectEqual(@as(?u32, 0), value.text_flow);
        try std.testing.expectEqual(@as(?i64, 1), value.z_order);
        try std.testing.expectEqualDeep([4]?i64{ 0, 0, 0, 0 }, value.outside_margins);
        found = true;
        break;
    }
    try std.testing.expect(found);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

//! 직접 head 취소선 요소의 원값입니다. 활성 의미나 표시 기본값을 만들지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;

pub const Value = struct {
    shape: ?[]u8,
    color: ?[]u8,
    pub fn deinit(self: *Value, a: std.mem.Allocator) void {
        if (self.shape) |value| a.free(value);
        if (self.color) |value| a.free(value);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !?Value {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    if (!tree.elements[node].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var found: ?usize = null;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "strikeout")) continue;
        if (found != null) return error.DuplicateCharacterStrikeElement;
        found = index;
    }
    const index = found orelse return null;
    const shape = if (try tree.attributeValue(a, index, "", "shape")) |raw| try raw.toUtf8(a, limit) else null;
    errdefer if (shape) |value| a.free(value);
    const color = if (try tree.attributeValue(a, index, "", "color")) |raw| try raw.toUtf8(a, limit) else null;
    return .{ .shape = shape, .color = color };
}

test "HWPX strike values separate absence NONE namespace and allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr><f:strikeout shape='SOLID'/></h:charPr><h:charPr><h:strikeout shape='NONE'/></h:charPr><h:charPr><h:strikeout shape='D&#79;T' color='#123456'/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?Value, null), try read(a, &tree, 1, 64));
    var none = (try read(a, &tree, 3, 64)).?;
    defer none.deinit(a);
    try std.testing.expectEqualStrings("NONE", none.shape.?);
    try std.testing.expect(none.color == null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            var value = (try read(allocator, parsed, 5, 64)).?;
            defer value.deinit(allocator);
            try std.testing.expectEqualStrings("DOT", value.shape.?);
            try std.testing.expectEqualStrings("#123456", value.color.?);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidElementIndex, read(a, &tree, tree.elements.len, 64));
    try std.testing.expectError(error.InvalidCharacterShapeElement, read(a, &tree, 0, 64));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX strike values reject duplicate direct elements" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr><h:strikeout/><h:strikeout/></h:charPr></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.DuplicateCharacterStrikeElement, read(a, &tree, 1, 64));
}

test "HWPX strike values read actual twelve resources without changing source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var resources: usize = 0;
    var present: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "charPr")) continue;
        resources += 1;
        const id = (try @import("character_shape_display.zig").read(a, &tree, index, 4096)).id.?;
        if (try read(a, &tree, index, 4096)) |raw| {
            var value = raw;
            defer value.deinit(a);
            present += 1;
            try std.testing.expect(id == 7 or id == 8 or id == 9);
            try std.testing.expectEqualStrings(if (id == 7) "SOLID" else "DOT", value.shape.?);
            try std.testing.expectEqualStrings("#000000", value.color.?);
        } else try std.testing.expect(id != 7 and id != 8 and id != 9);
    }
    try std.testing.expectEqual(@as(usize, 12), resources);
    try std.testing.expectEqual(@as(usize, 3), present);
}

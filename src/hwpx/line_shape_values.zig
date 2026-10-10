//! Owned lineShape attributes; source inspection is not paint eligibility.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const lexical = @import("xml_values.zig");
pub const Attributes = struct {
    color: ?[]const u8 = null,
    width: ?[]const u8 = null,
    style: ?[]const u8 = null,
    endCap: ?[]const u8 = null,
    headStyle: ?[]const u8 = null,
    tailStyle: ?[]const u8 = null,
    headfill: ?[]const u8 = null,
    tailfill: ?[]const u8 = null,
    headSz: ?[]const u8 = null,
    tailSz: ?[]const u8 = null,
    outlineStyle: ?[]const u8 = null,
    alpha: ?[]const u8 = null,
};
pub const Values = struct {
    arena: std.heap.ArenaAllocator,
    node: ?usize = null,
    attributes: Attributes = .{},
    known_color: ?bool = null,
    unknown_enums: usize = 0,
    pub fn deinit(self: *Values) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
fn contains(raw: []const u8, names: []const []const u8) bool {
    for (names) |name| if (std.mem.eql(u8, raw, name)) return true;
    return false;
}
// Collector is shared with the narrower legacy paint policy; do not change its
// error precedence by validating source-only fields before checking decoration.
pub fn collect(a: std.mem.Allocator, tree: *const Tree, parent: usize, max_attribute_bytes: usize) !Values {
    if (parent >= tree.elements.len) return error.InvalidElementIndex;
    var result: Values = .{ .arena = std.heap.ArenaAllocator.init(a) };
    errdefer result.deinit();
    var missing: usize = 0;
    var duplicate: usize = 0;
    result.node = fields.uniqueChild(tree, parent, "lineShape", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateLineStroke;
    const node = result.node orelse return result;
    inline for (std.meta.fields(Attributes)) |field| {
        if (try tree.attributeValue(result.arena.allocator(), node, "", field.name)) |raw|
            @field(result.attributes, field.name) = try raw.toUtf8(result.arena.allocator(), max_attribute_bytes);
    }
    const attr = result.attributes;
    if (attr.color) |value| result.known_color = lexical.sixHexColor(value);
    if (attr.style) |value| if (!@import("line_style_values.zig").knownType(value)) {
        result.unknown_enums += 1;
    };
    if (attr.endCap) |value| if (!contains(value, &.{ "FLAT", "ROUND" })) {
        result.unknown_enums += 1;
    };
    inline for (.{ "headStyle", "tailStyle" }) |name| if (@field(attr, name)) |value| {
        if (!contains(value, &.{ "NORMAL", "ARROW", "SPEAR", "CONCAVE_ARROW", "EMPTY_DIAMOND", "EMPTY_CIRCLE", "EMPTY_BOX", "FILLED_DIAMOND", "FILLED_CIRCLE", "FILLED_BOX" })) result.unknown_enums += 1;
    };
    inline for (.{ "headSz", "tailSz" }) |name| if (@field(attr, name)) |value| {
        if (!contains(value, &.{ "SMALL_SMALL", "SMALL_MEDIUM", "SMALL_LARGE", "MEDIUM_SMALL", "MEDIUM_MEDIUM", "MEDIUM_LARGE", "LARGE_SMALL", "LARGE_MEDIUM", "LARGE_LARGE" })) result.unknown_enums += 1;
    };
    if (attr.outlineStyle) |value| if (!contains(value, &.{ "NORMAL", "OUTER", "INNER" })) {
        result.unknown_enums += 1;
    };
    return result;
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, parent: usize, max_attribute_bytes: usize) !Values {
    var result = try collect(a, tree, parent, max_attribute_bytes);
    errdefer result.deinit();
    if (result.attributes.width) |value| _ = try lexical.nonNegative(value);
    inline for (.{ "headfill", "tailfill" }) |name| if (@field(result.attributes, name)) |value| {
        _ = try lexical.boolean(value);
    };
    if (result.attributes.alpha) |value| try lexical.floatLexical(value);
    return result;
}
test "lineShape source preserves wide width fractional alpha absent defaults and allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:connectLine><p:lineShape width='4294967296' alpha='0.5' tailStyle='ARROW' tailfill='1' headSz='FUTURE'/></p:connectLine><p:line/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            var value = try read(allocator, input, 1, 4096);
            defer value.deinit();
            try std.testing.expectEqualStrings("4294967296", value.attributes.width.?);
            try std.testing.expectEqualStrings("0.5", value.attributes.alpha.?);
            try std.testing.expectEqualStrings("ARROW", value.attributes.tailStyle.?);
            try std.testing.expect(value.attributes.headfill == null);
            try std.testing.expectEqual(@as(usize, 1), value.unknown_enums);
        }
    }.run, .{&tree});
    var missing = try read(a, &tree, 3, 4096);
    defer missing.deinit();
    try std.testing.expect(missing.node == null and missing.attributes.style == null);
    try std.testing.expectEqualStrings(source, tree.source);
}
test "lineShape source actual arrows distinguish seventeen arrows four spears and plain stroke" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 2, .{});
    defer tree.deinit(a);
    var arrows: usize = 0;
    var spears: usize = 0;
    var plain: usize = 0;
    for (tree.elements, 0..) |element, node| {
        const uri = @import("document_xml.zig").paragraph_uri;
        if (!element.is(uri, "line") and !element.is(uri, "connectLine")) continue;
        var value = try read(a, &tree, node, 4096);
        defer value.deinit();
        try std.testing.expect(value.node != null);
        try std.testing.expectEqual(@as(usize, 0), value.unknown_enums);
        try std.testing.expectEqualStrings("0", value.attributes.alpha.?);
        const head = value.attributes.headStyle orelse return error.MissingLineShapeHead;
        const tail = value.attributes.tailStyle orelse return error.MissingLineShapeTail;
        if (std.mem.eql(u8, head, "ARROW") or std.mem.eql(u8, tail, "ARROW")) arrows += 1 else if (std.mem.eql(u8, head, "SPEAR") or std.mem.eql(u8, tail, "SPEAR")) spears += 1 else plain += 1;
    }
    try std.testing.expectEqual(@as(usize, 17), arrows);
    try std.testing.expectEqual(@as(usize, 4), spears);
    try std.testing.expectEqual(@as(usize, 1), plain);
}

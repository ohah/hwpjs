//! Owned source response for line/connector decoration; not paint permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn encode(a: std.mem.Allocator, tree: *const Tree, node: usize) ![]u8 {
    if (node >= tree.elements.len) return error.InvalidDrawingStrokeNode;
    const element = tree.elements[node];
    const uri = @import("document_xml.zig").paragraph_uri;
    if (!element.is(uri, "line") and !element.is(uri, "connectLine")) return error.InvalidDrawingStrokeNode;
    var value = try @import("line_shape_values.zig").read(a, tree, node, 4096);
    defer value.deinit();
    return std.json.Stringify.valueAlloc(a, .{
        .sourceOnly = true,
        .node = node,
        .lineShapeNode = value.node,
        .attributes = value.attributes,
        .knownColor = value.known_color,
        .unknownEnums = value.unknown_enums,
    }, .{});
}

test "drawing stroke source encoding preserves wide lexical values and releases allocations" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:connectLine><p:lineShape width='4294967296' alpha='0.5' tailStyle='ARROW' headSz='FUTURE'/></p:connectLine><p:line/><x:line/><p:rect/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try encode(allocator, source, 1);
            defer allocator.free(output);
            const Response = struct {
                sourceOnly: bool,
                node: usize,
                lineShapeNode: ?usize,
                attributes: @import("line_shape_values.zig").Attributes,
                knownColor: ?bool,
                unknownEnums: usize,
            };
            var parsed = try std.json.parseFromSlice(Response, allocator, output, .{});
            defer parsed.deinit();
            try std.testing.expect(parsed.value.sourceOnly);
            try std.testing.expectEqual(@as(usize, 1), parsed.value.node);
            try std.testing.expectEqual(@as(?usize, 2), parsed.value.lineShapeNode);
            try std.testing.expectEqualStrings("4294967296", parsed.value.attributes.width.?);
            try std.testing.expectEqualStrings("0.5", parsed.value.attributes.alpha.?);
            try std.testing.expectEqualStrings("ARROW", parsed.value.attributes.tailStyle.?);
            try std.testing.expect(parsed.value.attributes.headfill == null);
            try std.testing.expect(parsed.value.knownColor == null);
            try std.testing.expectEqual(@as(usize, 1), parsed.value.unknownEnums);
        }
    }.run, .{&tree});
    const absent = try encode(a, &tree, 3);
    defer a.free(absent);
    try std.testing.expect(std.mem.indexOf(u8, absent, "\"lineShapeNode\":null") != null);
    try std.testing.expectError(error.InvalidDrawingStrokeNode, encode(a, &tree, 0));
    try std.testing.expectError(error.InvalidDrawingStrokeNode, encode(a, &tree, 4));
    try std.testing.expectError(error.InvalidDrawingStrokeNode, encode(a, &tree, 5));
    try std.testing.expectError(error.InvalidDrawingStrokeNode, encode(a, &tree, tree.elements.len));
    try std.testing.expectEqualStrings(input, tree.source);
}

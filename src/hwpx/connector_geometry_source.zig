//! Source-only connector query encoding; does not grant editing or paint rights.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const geometry = @import("connector_geometry_values.zig");

pub fn nodes(a: std.mem.Allocator, tree: *const Tree, max_nodes: usize) ![]u32 {
    var result: std.ArrayList(u32) = .empty;
    defer result.deinit(a);
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "connectLine")) continue;
        if (result.items.len == max_nodes) return error.LimitExceeded;
        try result.append(a, std.math.cast(u32, index) orelse return error.LimitExceeded);
    }
    return result.toOwnedSlice(a);
}

pub fn encode(a: std.mem.Allocator, tree: *const Tree, node: usize) ![]u8 {
    var value = try geometry.read(a, tree, node, .{});
    defer value.deinit();
    return std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .node = node, .geometry = .{
        .raw_type = value.raw_type,
        .known_type = value.known_type,
        .start = value.start,
        .end = value.end,
        .controls_present = value.controls_present,
        .controls = value.controls,
        .unexpected_children = value.unexpected_children,
    } }, .{});
}
pub fn encodeRendering(a: std.mem.Allocator, tree: *const Tree, node: usize) ![]u8 {
    var points = try @import("connector_rendering_points.zig").read(a, tree, node, 1024);
    defer points.deinit(a);
    return std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .coordinateSpace = "renderingInfo", .node = node, .endpoints = points.endpoints, .controls = points.controls }, .{});
}

test "connector source query owns output and preserves namespace limits and allocation failure" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:connectLine type='FUTURE'/><x:connectLine/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const indices = try nodes(allocator, input, 100);
            defer allocator.free(indices);
            try std.testing.expectEqualSlices(u32, &.{1}, indices);
            const json = try encode(allocator, input, 1);
            defer allocator.free(json);
            try std.testing.expect(std.mem.indexOf(u8, json, "\"sourceOnly\":true") != null);
            try std.testing.expect(std.mem.indexOf(u8, json, "\"raw_type\":\"FUTURE\"") != null);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, nodes(a, &tree, 0));
    try std.testing.expectError(error.InvalidConnectorGeometryNode, encode(a, &tree, 2));
}

test "connector rendering source encoding releases every allocation and labels coordinate space" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:connectLine><p:startPt x='1' y='2'/><p:endPt x='3' y='4'/><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='10' e4='0' e5='1' e6='20'/><c:scaMatrix e1='2' e2='0' e3='0' e4='0' e5='3' e6='0'/><c:rotMatrix e1='0' e2='-1' e3='0' e4='1' e5='0' e6='0'/></p:renderingInfo></p:connectLine></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const json = try encodeRendering(allocator, input, 1);
            defer allocator.free(json);
            const Response = struct { sourceOnly: bool, coordinateSpace: []const u8, node: usize, endpoints: [2][2]f64, controls: [][2]f64 };
            var parsed = try std.json.parseFromSlice(Response, allocator, json, .{});
            defer parsed.deinit();
            try std.testing.expect(parsed.value.sourceOnly);
            try std.testing.expectEqualStrings("renderingInfo", parsed.value.coordinateSpace);
            try std.testing.expectEqualDeep([2][2]f64{ .{ 4, 22 }, .{ -2, 26 } }, parsed.value.endpoints);
        }
    }.run, .{&tree});
}

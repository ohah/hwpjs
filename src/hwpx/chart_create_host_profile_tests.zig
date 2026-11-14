//! Declaration-based ownership regression, not an HWPX schema validator.
const std = @import("std");
const host = @import("chart_create_host.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

fn children(tree: *const Tree, owner: usize, expected: []const []const u8) !void {
    var child = tree.elements[owner].first_child;
    for (expected) |name| {
        const node = child orelse return error.MissingHostChild;
        try std.testing.expect(tree.elements[node].is(uri, name));
        child = tree.elements[node].next_sibling;
    }
    try std.testing.expect(child == null);
}

fn profileCase(a: std.mem.Allocator) !void {
    const fragment = try host.create(a, .{ .width = 21600, .height = 14400 }, .{ .chart = 1, .chart_instance = 2, .ole = 3, .ole_instance = 4 }, "Chart/created.xml", "created-ole");
    defer a.free(fragment);
    const section = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>", fragment, "</p:run></p:p></s:sec>" });
    defer a.free(section);
    var tree = try @import("section_tree.zig").parse(a, section, 0, 0, .{});
    defer tree.deinit(a);
    var chart: ?usize = null;
    var ole: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(uri, "chart")) {
            try std.testing.expect(chart == null);
            chart = index;
        }
        if (element.is(uri, "ole")) {
            try std.testing.expect(ole == null);
            ole = index;
        }
    }
    const c = chart orelse return error.MissingChartHost;
    const o = ole orelse return error.MissingOleHost;
    try children(&tree, c, &.{ "sz", "pos", "outMargin" });
    try children(&tree, o, &.{ "offset", "orgSz", "curSz", "flip", "rotationInfo", "renderingInfo", "sz", "pos", "outMargin" });
    for ([_][]const u8{ "instid", "href", "groupLevel", "reverse" }) |name| try std.testing.expect(try tree.attributeValue(a, c, "", name) == null);
    for ([_][]const u8{ "instid", "href", "groupLevel" }) |name| try std.testing.expect(try tree.attributeValue(a, o, "", name) != null);
    try std.testing.expect(try tree.attributeValue(a, o, "", "reverse") == null);
    const chart_id = (try tree.attributeValue(a, c, "", "id")).?;
    const chart_text = try chart_id.toUtf8(a, 32);
    defer a.free(chart_text);
    try std.testing.expectEqualStrings("1", chart_text);
    const ole_instance = (try tree.attributeValue(a, o, "", "instid")).?;
    const instance_text = try ole_instance.toUtf8(a, 32);
    defer a.free(instance_text);
    try std.testing.expectEqualStrings("4", instance_text);
    // Chart's r1 compatibility reservation is never emitted as an instance.
    try std.testing.expect(std.mem.indexOf(u8, fragment, "instid=\"2\"") == null);
}

test "HWPX chart create successor host separates declared object and component fields" {
    try profileCase(std.testing.allocator);
}
test "HWPX chart create successor host ownership allocation failures" {
    try @import("../testing/allocation_failures.zig").check(profileCase, .{});
}

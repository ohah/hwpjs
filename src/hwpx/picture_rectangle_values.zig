//! imgRect 원본 꼭짓점만 읽습니다. 크기·crop·변환 사각형으로 대체하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const xml = @import("document_xml.zig");
pub const Values = struct {
    present: bool = false,
    points: [4][2]?i64 = @splat(@splat(null)),
    point_present: [4]bool = @splat(false),
    unknown_children: usize = 0,
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize) !Values {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    var missing: usize = 0;
    var duplicate: usize = 0;
    const rectangle = fields.uniqueChild(tree, picture, "imgRect", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureRectangle;
    const root = rectangle orelse return .{};
    return readPoints(a, tree, root, true);
}

pub fn readRectangle(a: std.mem.Allocator, tree: *const Tree, rectangle: usize) !Values {
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidDrawingTextNode;
    return readPoints(a, tree, rectangle, false);
}

fn readPoints(a: std.mem.Allocator, tree: *const Tree, root: usize, count_unknown: bool) !Values {
    var result: Values = .{ .present = true };
    var cursor = tree.elements[root].first_child;
    while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        var selected: ?usize = null;
        for ([_][]const u8{ "pt0", "pt1", "pt2", "pt3" }, 0..) |name, index| {
            if (element.is(xml.core_uri, name)) {
                selected = index;
                break;
            }
        }
        const index = selected orelse {
            if (count_unknown) result.unknown_children += 1;
            continue;
        };
        if (result.point_present[index]) return error.DuplicatePictureRectanglePoint;
        result.point_present[index] = true;
        for ([_][]const u8{ "x", "y" }, 0..) |name, coordinate| {
            if (try tree.attributeValue(a, node, "", name)) |raw| result.points[index][coordinate] = try fields.margin(a, raw, 4096);
        }
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'><p:pic><p:imgRect><c:pt0 x='-1' y='&#48;'/><c:pt1 x='4294967295'/><x:pt2/><c:pt3/></p:imgRect></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expect(value.present);
    try std.testing.expectEqualDeep([4]bool{ true, true, false, true }, value.point_present);
    try std.testing.expectEqualDeep([2]?i64{ -1, 0 }, value.points[0]);
    try std.testing.expectEqualDeep([2]?i64{ 4294967295, null }, value.points[1]);
    try std.testing.expectEqualDeep([2]?i64{ null, null }, value.points[3]);
    try std.testing.expectEqual(@as(usize, 1), value.unknown_children);
}

fn rectangleAllocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:rect><p:sz/><c:pt0 x='0' y='-1'/><c:pt1 x='2'/></p:rect></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const value = try readRectangle(a, &tree, 1);
    try std.testing.expectEqualDeep([2]?i64{ 0, -1 }, value.points[0]);
    try std.testing.expectEqualDeep([4]bool{ true, true, false, false }, value.point_present);
    try std.testing.expectEqual(@as(usize, 0), value.unknown_children);
    try std.testing.expectError(error.InvalidDrawingTextNode, readRectangle(a, &tree, 0));
}

test "HWPX drawing rectangle shares partial point reader with allocation failures" {
    try rectangleAllocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(rectangleAllocationCase, .{});
}

test "HWPX picture rectangle preserves missing points namespace signed coordinates and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture rectangle rejects duplicates and preserves absent rectangle" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:pic>";
    var empty = try @import("section_tree.zig").parse(a, prefix ++ "</p:pic></s:sec>", 0, 0, .{});
    defer empty.deinit(a);
    try std.testing.expectEqualDeep(Values{}, try read(a, &empty, 1));
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &empty, 0));
    var duplicate = try @import("section_tree.zig").parse(a, prefix ++ "<p:imgRect/><p:imgRect/></p:pic></s:sec>", 0, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicatePictureRectangle, read(a, &duplicate, 1));
    var points = try @import("section_tree.zig").parse(a, prefix ++ "<p:imgRect><c:pt0/><c:pt0/></p:imgRect></p:pic></s:sec>", 0, 0, .{});
    defer points.deinit(a);
    try std.testing.expectError(error.DuplicatePictureRectanglePoint, read(a, &points, 1));
}

test "HWPX picture rectangle reads direct and grouped fixture original corners" {
    const a = std.testing.allocator;
    inline for (.{ .{ "sample-5017-pics", 12600, 7560 }, .{ "shapecontainer-2", 45899, 6300 } }) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/" ++ case[0] ++ ".hwpx", a, .limited(16_000_000));
        defer a.free(bytes);
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        const tree = &session.sections[0].tree;
        var found = false;
        for (tree.elements, 0..) |element, node| {
            if (!element.is(xml.paragraph_uri, "pic")) continue;
            const value = try read(a, tree, node);
            try std.testing.expect(value.present);
            try std.testing.expectEqualDeep([4]bool{ true, true, true, true }, value.point_present);
            try std.testing.expectEqualDeep([4][2]?i64{ .{ 0, 0 }, .{ case[1], 0 }, .{ case[1], case[2] }, .{ 0, case[2] } }, value.points);
            try std.testing.expectEqual(@as(usize, 0), value.unknown_children);
            found = true;
            break;
        }
        try std.testing.expect(found);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
    }
}

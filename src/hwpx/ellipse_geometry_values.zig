//! Ellipse-local source values only. Common placement, transforms and paint are separate.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const fields = @import("table_xml_fields.zig");
pub const PointKind = enum { center, ax1, ax2, start1, end1, start2, end2 };
const point_names = [_][]const u8{ "center", "ax1", "ax2", "start1", "end1", "start2", "end2" };
pub const Point = struct { x: ?i64 = null, y: ?i64 = null };
pub const Values = struct {
    arena: std.heap.ArenaAllocator,
    interval_dirty: ?[]const u8 = null,
    has_arc_properties: ?[]const u8 = null,
    arc_type: ?[]const u8 = null,
    points: [7]?Point = @splat(null),

    pub fn deinit(self: *Values) void {
        self.arena.deinit();
        self.* = undefined;
    }
    pub fn point(self: Values, kind: PointKind) ?Point {
        return self.points[@backingInt(kind)];
    }
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !tree.elements[node].is(xml.paragraph_uri, "ellipse")) return error.InvalidEllipseGeometryNode;
    var result: Values = .{ .arena = std.heap.ArenaAllocator.init(a) };
    errdefer result.deinit();
    const owned = result.arena.allocator();
    inline for (.{ .{ "intervalDirty", "interval_dirty" }, .{ "hasArcPr", "has_arc_properties" }, .{ "arcType", "arc_type" } }) |attribute| {
        if (try tree.attributeValue(owned, node, "", attribute[0])) |raw| @field(result, attribute[1]) = try raw.toUtf8(owned, 4096);
    }
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        for (point_names, 0..) |name, slot| {
            if (!tree.elements[index].is(xml.core_uri, name)) continue;
            if (result.points[slot] != null) return error.DuplicateEllipseGeometryPoint;
            var value: Point = .{};
            if (try tree.attributeValue(owned, index, "", "x")) |raw| value.x = try fields.margin(owned, raw, 4096);
            if (try tree.attributeValue(owned, index, "", "y")) |raw| value.y = try fields.margin(owned, raw, 4096);
            result.points[slot] = value;
            break;
        }
    }
    return result;
}

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'>";
fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:ellipse arcType='FUTURE' hasArcPr='0'><c:center x='-1' y='&#48;'/><c:ax1/><x:ax2 x='7'/></p:ellipse></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var value = try read(a, &tree, 1);
    defer value.deinit();
    try std.testing.expectEqualStrings("FUTURE", value.arc_type.?);
    try std.testing.expectEqualStrings("0", value.has_arc_properties.?);
    try std.testing.expect(value.interval_dirty == null);
    try std.testing.expectEqualDeep(Point{ .x = -1, .y = 0 }, value.point(.center).?);
    try std.testing.expectEqualDeep(Point{}, value.point(.ax1).?);
    try std.testing.expect(value.point(.ax2) == null);
}
test "ellipse local source preserves absence signed points namespaces unknown attributes and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
test "ellipse local source rejects duplicate points invalid coordinates and wrong root" {
    const a = std.testing.allocator;
    var duplicate = try @import("section_tree.zig").parse(a, prefix ++ "<p:ellipse><c:center/><c:center/></p:ellipse></s:sec>", 0, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicateEllipseGeometryPoint, read(a, &duplicate, 1));
    try std.testing.expectError(error.InvalidEllipseGeometryNode, read(a, &duplicate, 0));
    try std.testing.expectError(error.InvalidEllipseGeometryNode, read(a, &duplicate, duplicate.elements.len));
    var bad = try @import("section_tree.zig").parse(a, prefix ++ "<p:ellipse><c:center x='bad'/></p:ellipse></s:sec>", 0, 0, .{});
    defer bad.deinit(a);
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, read(a, &bad, 1));
}

test "ellipse local source reads actual returning student form without inventing rectangle points" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/복학원서.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(xml.paragraph_uri, "ellipse")) continue;
        var value = try read(a, tree, node);
        defer value.deinit();
        try std.testing.expectEqualStrings("NORMAL", value.arc_type.?);
        try std.testing.expectEqualStrings("0", value.has_arc_properties.?);
        try std.testing.expectEqualStrings("0", value.interval_dirty.?);
        try std.testing.expectEqualDeep(Point{ .x = 4860, .y = 4350 }, value.point(.center).?);
        try std.testing.expectEqualDeep(Point{ .x = 4860, .y = 0 }, value.point(.ax1).?);
        try std.testing.expectEqualDeep(Point{ .x = 9720, .y = 4350 }, value.point(.ax2).?);
        inline for (.{ PointKind.start1, .end1, .start2, .end2 }) |kind| try std.testing.expectEqualDeep(Point{ .x = 0, .y = 0 }, value.point(kind).?);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
}

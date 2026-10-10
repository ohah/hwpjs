//! 선 끝점의 원값만 읽습니다. 크기 변환과 페이지 배치는 별도 책임입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const names = @import("document_xml.zig");
const fields = @import("table_xml_fields.zig");
pub const Point = struct { x: ?i64 = null, y: ?i64 = null };
pub const Values = struct { start: ?Point = null, end: ?Point = null, reverse_hv: ?bool = null };

fn point(a: std.mem.Allocator, tree: *const Tree, node: usize) !Point {
    var result: Point = .{};
    if (try tree.attributeValue(a, node, "", "x")) |raw| result.x = try fields.margin(a, raw, 4096);
    if (try tree.attributeValue(a, node, "", "y")) |raw| result.y = try fields.margin(a, raw, 4096);
    return result;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !tree.elements[node].is(names.paragraph_uri, "line")) return error.InvalidLineGeometryNode;
    var result: Values = .{};
    if (try tree.attributeValue(a, node, "", "isReverseHV")) |raw| result.reverse_hv = try fields.boolean(a, raw, 4096);
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (element.is(names.core_uri, "startPt")) {
            if (result.start != null) return error.DuplicateLineGeometryChild;
            result.start = try point(a, tree, index);
        } else if (element.is(names.core_uri, "endPt")) {
            if (result.end != null) return error.DuplicateLineGeometryChild;
            result.end = try point(a, tree, index);
        }
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:f='urn:foreign'><p:line isReverseHV='false'><f:startPt x='999'/><c:startPt x='&#48;' y='-1'/><c:endPt x='4294967295'/></p:line><p:line/><p:line><c:startPt/><c:startPt/></p:line></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const actual = try read(a, &tree, 1);
    try std.testing.expectEqualDeep(Values{ .start = .{ .x = 0, .y = -1 }, .end = .{ .x = 4294967295 }, .reverse_hv = false }, actual);
    try std.testing.expectEqualDeep(Values{}, try read(a, &tree, 5));
    try std.testing.expectError(error.DuplicateLineGeometryChild, read(a, &tree, 6));
    try std.testing.expectError(error.InvalidLineGeometryNode, read(a, &tree, tree.elements.len));
}

test "HWPX line geometry preserves namespace absence zero and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX line geometry actual endpoints differ from display size" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(names.paragraph_uri, "line")) continue;
        const actual = try read(a, tree, index);
        try std.testing.expectEqualDeep(Point{ .x = 0, .y = 0 }, actual.start.?);
        try std.testing.expectEqualDeep(Point{ .x = if (count == 0) 2100 else 2400, .y = if (count == 0) 2050 else 2350 }, actual.end.?);
        try std.testing.expectEqual(@as(?bool, false), actual.reverse_hv);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), count);
}

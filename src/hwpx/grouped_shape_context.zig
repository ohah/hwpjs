//! 그룹 자식의 원본 부모 경로입니다. 좌표 변환과 크기 상속은 수행하지 않습니다.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Context = struct { parent_container: usize, root_anchor: usize, depth: usize };

pub fn read(tree: *const Tree, node: usize) !?Context {
    if (node >= tree.elements.len) return error.InvalidPartTree;
    const element = tree.elements[node];
    if (!element.is(uri, "pic") and !element.is(uri, "rect") and !element.is(uri, "ellipse") and !element.is(uri, "curve") and !element.is(uri, "container")) return null;
    const parent = element.parent orelse return null;
    if (parent >= node) return error.InvalidPartTree;
    if (!tree.elements[parent].is(uri, "container")) return null;
    var current = parent;
    var depth: usize = 1;
    while (true) {
        if (@import("run_anchor.zig").kind(tree, current) == .container) return .{ .parent_container = parent, .root_anchor = current, .depth = depth };
        const next = tree.elements[current].parent orelse return error.UnsupportedGroupedShapeHost;
        if (next >= current) return error.InvalidPartTree;
        if (!tree.elements[next].is(uri, "container")) return error.UnsupportedGroupedShapeHost;
        current = next;
        depth += 1;
    }
}

test "HWPX grouped shape context distinguishes exact parent depth and namespace" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:p><p:run><p:container><p:rect/><p:container><p:rect/><p:pic/></p:container><f:rect/></p:container></p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Context{ .parent_container = 3, .root_anchor = 3, .depth = 1 }, (try read(&tree, 4)).?);
    try std.testing.expectEqualDeep(Context{ .parent_container = 5, .root_anchor = 3, .depth = 2 }, (try read(&tree, 6)).?);
    try std.testing.expectEqualDeep((try read(&tree, 6)).?, (try read(&tree, 7)).?);
    try std.testing.expect(try read(&tree, 3) == null);
    try std.testing.expect(try read(&tree, 8) == null);
    tree.elements[5].parent = 6;
    try std.testing.expectError(error.InvalidPartTree, read(&tree, 6));
}

test "HWPX grouped ellipse context preserves nested root and exact namespace" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:p><p:run><p:container><p:ellipse/><p:container><p:ellipse/><f:ellipse/></p:container></p:container><p:ellipse/></p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Context{ .parent_container = 3, .root_anchor = 3, .depth = 1 }, (try read(&tree, 4)).?);
    try std.testing.expectEqualDeep(Context{ .parent_container = 5, .root_anchor = 3, .depth = 2 }, (try read(&tree, 6)).?);
    try std.testing.expect(try read(&tree, 7) == null);
    try std.testing.expect(try read(&tree, 8) == null);
    try std.testing.expectError(error.InvalidPartTree, read(&tree, tree.elements.len));
    tree.elements[5].parent = 6;
    try std.testing.expectError(error.InvalidPartTree, read(&tree, 6));
}

test "HWPX grouped shape context actual container members share root anchor" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var members: usize = 0;
    var nested: usize = 0;
    for (tree.elements, 0..) |_, node| {
        if (try read(tree, node)) |context| {
            members += 1;
            if (context.depth == 2) nested += 1;
            try std.testing.expectEqual(@as(usize, 31), context.root_anchor);
            if (tree.elements[node].is(uri, "pic")) try std.testing.expectEqual(try @import("picture_display_host.zig").sourceAnchor(tree, node), context.root_anchor);
        }
    }
    try std.testing.expectEqual(@as(usize, 5), members);
    try std.testing.expectEqual(@as(usize, 2), nested);
}

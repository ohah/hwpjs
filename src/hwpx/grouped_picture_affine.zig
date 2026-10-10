//! Explicit accumulated/local interpretations; no automatic policy inference.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const affine = @import("picture_transform_affine.zig");
const transforms = @import("picture_transform_values.zig");
pub const Policy = enum { compose_local, source_accumulated };
pub const Result = struct { matrix: affine.Matrix, context: ?@import("grouped_shape_context.zig").Context };

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize, edits: *const @import("picture_matrix_edit_values.zig").Values, policy: Policy, max_depth: usize, max_matrices: usize) !Result {
    const context = try @import("grouped_shape_context.zig").read(tree, picture);
    if (context) |group| if (group.depth > max_depth) return error.LimitExceeded;
    var child = try transforms.readCurrent(a, tree, picture, edits, max_matrices);
    defer child.deinit(a);
    var matrix = try affine.renderingMatrix(&child);
    if (policy == .source_accumulated) return .{ .matrix = matrix, .context = context };
    if (context) |group| {
        var parent = group.parent_container;
        var depth: usize = 0;
        while (true) {
            if (depth >= max_depth) return error.LimitExceeded;
            var owner = try transforms.readContainer(a, tree, parent, max_matrices);
            defer owner.deinit(a);
            matrix = try affine.multiply(try affine.renderingMatrix(&owner), matrix);
            depth += 1;
            if (parent == group.root_anchor) break;
            const next = tree.elements[parent].parent orelse return error.InvalidPartTree;
            if (next >= parent) return error.InvalidPartTree;
            parent = next;
        }
        if (depth != group.depth) return error.InvalidPartTree;
    }
    return .{ .matrix = matrix, .context = context };
}

test "grouped picture explicit local affine composes noncommuting parents and rejects depth and malformed paths" {
    const a = std.testing.allocator;
    const identity = "<c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:rotMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/>";
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:container><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='10' e4='0' e5='1' e6='20'/>" ++ identity ++ "</p:renderingInfo><p:container><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:scaMatrix e1='2' e2='0' e3='0' e4='0' e5='3' e6='0'/><c:rotMatrix e1='0' e2='-1' e3='0' e4='1' e5='0' e6='0'/></p:renderingInfo><p:pic><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='4' e4='0' e5='1' e6='5'/>" ++ identity ++ "</p:renderingInfo></p:pic></p:container></p:container></p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    var picture: usize = 0;
    for (tree.elements, 0..) |element, node| if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
        picture = node;
        break;
    };
    const edits: @import("picture_matrix_edit_values.zig").Values = .empty;
    const result = try read(a, &tree, picture, &edits, .compose_local, 2, 3);
    // (1,2) -> child (5,7) -> scale (10,21) -> rotation (-21,10) -> outer (-11,30).
    try std.testing.expectEqualDeep([2]f64{ -11, 30 }, try affine.transformPoint(result.matrix, .{ 1, 2 }));
    try std.testing.expectEqual(@as(usize, 2), result.context.?.depth);
    const accumulated = try read(a, &tree, picture, &edits, .source_accumulated, 2, 3);
    try std.testing.expectEqualDeep([2]f64{ 5, 7 }, try affine.transformPoint(accumulated.matrix, .{ 1, 2 }));
    try std.testing.expectEqualDeep(result.context, accumulated.context);
    const rendering = tree.elements[picture].first_child.?;
    const matrix_node = tree.elements[rendering].first_child.?;
    var entries = [_]@import("picture_matrix_edit_values.zig").Entry{.{ .matrix_node = matrix_node, .values = .{ 1, 0, 7, 0, 1, 9 } }};
    const pending: @import("picture_matrix_edit_values.zig").Values = .{ .items = &entries, .capacity = entries.len };
    const changed = try read(a, &tree, picture, &pending, .source_accumulated, 2, 3);
    try std.testing.expectEqualDeep([2]f64{ 8, 11 }, try affine.transformPoint(changed.matrix, .{ 1, 2 }));
    try std.testing.expectError(error.LimitExceeded, read(a, &tree, picture, &edits, .compose_local, 1, 3));
    try std.testing.expectError(error.LimitExceeded, read(a, &tree, picture, &edits, .compose_local, 2, 2));
    tree.elements[result.context.?.parent_container].parent = picture;
    try std.testing.expectError(error.InvalidPartTree, read(a, &tree, picture, &edits, .compose_local, 2, 3));
}

test "grouped picture explicit local affine reads real source without mutation and handles allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, picture| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        const result = try read(a, tree, picture, &session.sections[0].picture_matrices, .compose_local, 16, 32);
        try std.testing.expectEqualDeep(affine.Matrix{ 1.296935, 0, 0, 0, 0.584921, 312 }, result.matrix);
        try std.testing.expectEqual(@as(usize, 1), result.context.?.depth);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree, node: usize, expected: Result) !void {
                const empty: @import("picture_matrix_edit_values.zig").Values = .empty;
                try std.testing.expectEqualDeep(expected, try read(allocator, source, node, &empty, .compose_local, 16, 32));
            }
        }.run, .{ tree, picture, result });
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

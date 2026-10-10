//! Source node discovery only, not active selection/rendering/editing permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const anchors = @import("run_anchor.zig");
pub const Node = struct { formNode: usize, kind: anchors.Kind };
pub fn read(a: std.mem.Allocator, tree: *const Tree, max_nodes: usize) ![]Node {
    var rows: std.ArrayList(Node) = .empty;
    errdefer rows.deinit(a);
    for (tree.elements, 0..) |_, index| {
        const kind = anchors.kind(tree, index) orelse continue;
        if (!anchors.isForm(kind)) continue;
        if (rows.items.len >= max_nodes) return error.LimitExceeded;
        try rows.append(a, .{ .formNode = index, .kind = kind });
    }
    return rows.toOwnedSlice(a);
}
test "HWPX form source nodes bound inventory and ignore foreign or indirect objects under OOM" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:btn/><x:checkBtn/><p:ctrl><p:edit/></p:ctrl><p:checkBtn/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, read(a, &tree, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const rows = try read(allocator, parsed, 2);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 2), rows.len);
            try std.testing.expectEqual(.button, rows[0].kind);
            try std.testing.expectEqual(.check_button, rows[1].kind);
            try std.testing.expect(rows[0].formNode < rows[1].formNode);
        }
    }.run, .{&tree});
}

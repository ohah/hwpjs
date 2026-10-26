//! Original/current component sizes, not page size or an inferred text frame.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Size = struct { width: ?u32, height: ?u32 };
pub const Values = struct { original: ?Size, current: ?Size };
fn size(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?Size {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const child = fields.uniqueChild(tree, node, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateShapeComponentSize;
    const index = child orelse return null;
    return .{ .width = try fields.optionalUnsigned(a, tree, index, "width", 4096), .height = try fields.optionalUnsigned(a, tree, index, "height", 4096) };
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or (!fields.childIs(tree, node, "curve") and !fields.childIs(tree, node, "ellipse"))) return error.InvalidShapeComponentSizeNode;
    return .{ .original = try size(a, tree, node, "orgSz"), .current = try size(a, tree, node, "curSz") };
}
fn allocationCase(a: std.mem.Allocator) !void {
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:curve><p:orgSz width='3175' height='1090'/><p:curSz width='0'/><f:curSz width='8'/></p:curve><p:ellipse/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Values{ .original = .{ .width = 3175, .height = 1090 }, .current = .{ .width = 0, .height = null } }, try read(a, &tree, 1));
    try std.testing.expectEqualDeep(Values{ .original = null, .current = null }, try read(a, &tree, 5));
}
test "shape component sizes preserve absent children missing fields zero and namespaces with allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
test "shape component sizes reject duplicate source size and invalid numeric values" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:curve><p:orgSz/><p:orgSz/></p:curve><p:curve><p:curSz width='-1'/></p:curve></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.DuplicateShapeComponentSize, read(a, &tree, 1));
    try std.testing.expectError(error.InvalidNonNegativeInteger, read(a, &tree, 4));
    try std.testing.expectError(error.InvalidShapeComponentSizeNode, read(a, &tree, 0));
}

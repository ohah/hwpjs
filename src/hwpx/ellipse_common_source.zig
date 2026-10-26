//! Ellipse common placement and rendering values; no invented rectangle corners.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Source = @import("shape_common_source.zig").Source;
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Source {
    return @import("shape_common_source.zig").read(a, tree, node, .ellipse);
}

fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:ellipse><p:sz width='12' height='34' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/></p:ellipse></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?u32, 12), value.geometry.width);
    try std.testing.expect(value.group_context == null);
    try std.testing.expectEqual(@as(?u32, 34), value.geometry.height);
    try std.testing.expect(value.geometry.treat_as_character == null);
    try std.testing.expect(value.position.flags[0] == null);
    try std.testing.expect(value.flow.text_wrap == null);
    try std.testing.expect(value.rendering.matrix == null);
    try std.testing.expect(value.rendering.matrix_error != null);
    try std.testing.expectError(error.InvalidEllipseGeometryNode, read(a, &tree, 0));
}
test "ellipse common source preserves absent placement and rendering with allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

fn decoratedCase(a: std.mem.Allocator) !void {
    const bytes = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:ellipse><p:lineShape color='#FF0000' width='0' style='SOLID' headStyle='ARROW'/><p:shadow type='NONE'/></p:ellipse></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expect(value.stroke == null);
    try std.testing.expectEqualStrings("UnsupportedLineStrokeDecoration", value.stroke_error.?);
    try std.testing.expect(value.paint.fill_node == null);
    try std.testing.expectEqual(@as(?u32, 0), value.paint.shadow_type);
}
test "ellipse common source retains unsupported stroke diagnostics instead of painting a plain line" {
    try decoratedCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(decoratedCase, .{});
}

fn noStrokeCase(a: std.mem.Allocator) !void {
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:ellipse><p:lineShape color='#10000000' width='32' style='NONE'/></p:ellipse></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?u32, 0), value.stroke_style);
    try std.testing.expect(value.stroke == null);
    try std.testing.expectEqualStrings("UnsupportedLineStrokeColor", value.stroke_error.?);
}
test "ellipse common source preserves explicit no stroke independently of extended color" {
    try noStrokeCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(noStrokeCase, .{});
}

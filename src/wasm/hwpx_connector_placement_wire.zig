//! Source placement only; no page box resolution or arrow rendering.
const std = @import("std");
const Tree = @import("../hwpx/xml_part_tree.zig").Tree;
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) ![]u8 {
    const geometry = try @import("../hwpx/picture_geometry_values.zig").readConnector(a, tree, node);
    const position = try @import("../hwpx/picture_position_values.zig").readConnector(a, tree, node);
    const flow = try @import("../hwpx/picture_flow_values.zig").readConnector(a, tree, node);
    return @import("drawing_placement_wire.zig").encode(a, geometry, position, flow);
}
test "connector placement wire shares framing and cleans every failed allocation" {
    const a = std.testing.allocator;
    var tree = try @import("../hwpx/section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:connectLine zOrder='0' textWrap='IN_FRONT_OF_TEXT'><p:sz width='0' height='10' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><p:pos treatAsChar='false' vertRelTo='PAPER' horzRelTo='PAPER' vertAlign='TOP' horzAlign='LEFT' horzOffset='-1' vertOffset='0'/></p:connectLine><p:line/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const bytes = try read(allocator, source, 1);
            defer allocator.free(bytes);
            try std.testing.expectEqual(@as(usize, 144), bytes.len);
            try std.testing.expectEqualStrings("HPG1", bytes[0..4]);
            try std.testing.expectEqualStrings("HPP1", bytes[48..52]);
            try std.testing.expectEqualStrings("HPF1", bytes[88..92]);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidConnectorGeometryNode, read(a, &tree, 4));
    try std.testing.expectError(error.InvalidConnectorGeometryNode, read(a, &tree, tree.elements.len));
}

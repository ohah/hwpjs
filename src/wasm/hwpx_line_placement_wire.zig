//! 선은 기존 크기/위치/흐름 wire를 변경 없이 조합합니다.
const std = @import("std");
const Tree = @import("../hwpx/xml_part_tree.zig").Tree;
pub fn read(a: std.mem.Allocator, tree: *const Tree, line: usize) ![]u8 {
    const geometry = try @import("../hwpx/picture_geometry_values.zig").readLine(a, tree, line);
    const position = try @import("../hwpx/picture_position_values.zig").readLine(a, tree, line);
    const flow = try @import("../hwpx/picture_flow_values.zig").readLine(a, tree, line);
    return @import("drawing_placement_wire.zig").encode(a, geometry, position, flow);
}

test "HWPX line placement wire shares geometry position flow and all allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("../hwpx/section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:line zOrder='0' textWrap='IN_FRONT_OF_TEXT'><p:sz width='0' height='10' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><p:pos treatAsChar='false' vertRelTo='PAPER' horzRelTo='PAPER' vertAlign='TOP' horzAlign='LEFT' horzOffset='-1' vertOffset='0'/></p:line></s:sec>", 0, 0, .{});
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
    try std.testing.expectError(error.InvalidPictureDisplayNode, @import("../hwpx/picture_geometry_values.zig").read(a, &tree, 1));
    try std.testing.expectError(error.InvalidLineGeometryNode, read(a, &tree, 0));
}

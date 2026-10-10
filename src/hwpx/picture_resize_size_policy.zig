//! Select size ownership without synthesizing missing source elements.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn grouped(a: std.mem.Allocator, tree: *const Tree, picture: usize, dimensions: @import("picture_dimension_values.zig").Values) !bool {
    if (dimensions.display[0] != null and dimensions.display[1] != null) return false;
    if (dimensions.display[0] != null or dimensions.display[1] != null) return error.MissingPictureDimensionElement;
    if (try @import("picture_dimension_values.zig").child(tree, picture, "sz") != null) return error.MissingPictureDimensionElement;
    const context = (try @import("grouped_shape_context.zig").read(tree, picture)) orelse return error.MissingPictureDimensionElement;
    if (dimensions.current[0] == null or dimensions.current[1] == null) return error.MissingPictureDimensionElement;
    const root = try @import("picture_geometry_values.zig").readContainer(a, tree, context.root_anchor);
    if (root.width_relative != 4 or root.height_relative != 2) return error.UnsupportedRelativePictureResize;
    var node = context.parent_container;
    while (true) {
        var missing: usize = 0;
        var duplicate: usize = 0;
        const size = @import("table_xml_fields.zig").uniqueChild(tree, node, "sz", &missing, &duplicate);
        if (duplicate != 0) return error.DuplicatePictureGeometryChild;
        if (size) |child| if (try tree.attributeValue(a, child, "", "protect")) |raw| {
            if (try @import("table_xml_fields.zig").boolean(a, raw, 4096)) return error.PictureSizeProtected;
        };
        if (node == context.root_anchor) break;
        node = tree.elements[node].parent orelse return error.InvalidPartTree;
    }
    return true;
}

test "picture resize size policy rejects incomplete grouped sizes protected parents and relative roots" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:container>";
    const suffix = "</p:container></p:run></p:p></s:sec>";
    inline for (.{
        .{ "<p:sz widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><p:pic><p:sz/><p:curSz width='0' height='0'/></p:pic>", error.MissingPictureDimensionElement },
        .{ "<p:sz widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><p:pic><p:curSz width='0'/></p:pic>", error.MissingPictureDimensionElement },
        .{ "<p:sz widthRelTo='PAPER' heightRelTo='ABSOLUTE'/><p:pic><p:curSz width='0' height='0'/></p:pic>", error.UnsupportedRelativePictureResize },
        .{ "<p:sz widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE' protect='1'/><p:pic><p:curSz width='0' height='0'/></p:pic>", error.PictureSizeProtected },
    }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ case[0] ++ suffix, 0, 0, .{});
        defer tree.deinit(a);
        const dimensions = try @import("picture_dimension_values.zig").read(a, &tree, 5);
        try std.testing.expectError(case[1], grouped(a, &tree, 5, dimensions));
    }
}

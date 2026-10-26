//! Merge each authoritative scalar owner once for current picture geometry.
const std = @import("std");
pub fn read(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, dimensions: *const @import("picture_dimension_edit_values.zig").Values, frames: *const @import("picture_frame_values.zig").Values, picture: usize) !@import("picture_geometry_values.zig").Values {
    var geometry = try @import("picture_frame_values.zig").read(a, tree, frames, picture);
    for (dimensions.items) |entry| if (entry.picture_node == picture) {
        if (entry.update.display) |pair| {
            geometry.width = pair[0];
            geometry.height = pair[1];
        }
        break;
    };
    return geometry;
}

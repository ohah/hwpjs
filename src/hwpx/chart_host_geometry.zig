//! Section-owned chart layout declarations, never OLE preview coordinates.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const geometry = @import("picture_geometry_values.zig");
const position = @import("picture_position_values.zig");
pub const Values = struct {
    wrapper_node: usize,
    chart_node: usize,
    geometry: geometry.Values,
    position: position.Values,
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, wrapper: usize) !Values {
    const owners = try @import("chart_pair_target.zig").objects(tree, wrapper);
    return .{
        .wrapper_node = wrapper,
        .chart_node = owners.chart,
        .geometry = try geometry.readChart(a, tree, owners.chart),
        .position = try position.readChart(a, tree, owners.chart),
    };
}

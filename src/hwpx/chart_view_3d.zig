//! Chart-owned view settings only; no defaults, projection or save-state ownership.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
pub const Settings = struct {
    node: usize,
    rotation_x: ?scalar.Field(i32) = null,
    rotation_y: ?scalar.Field(u32) = null,
    height_percent: ?scalar.Field(u32) = null,
    depth_percent: ?scalar.Field(u32) = null,
    right_angle_axes: ?scalar.Field(bool) = null,
    perspective: ?scalar.Field(u32) = null,
    unparsed_children: bool = false,
};

fn numeric(comptime T: type, a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize, minimum: T, maximum: T) !scalar.Field(T) {
    const result = try scalar.read(T, a, tree, node, limit, error.InvalidChartView3D);
    if (result.value) |value| if (value < minimum or value > maximum) return error.InvalidChartView3D;
    return result;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, limit: usize) !?Settings {
    const chart = try @import("chart_owner.zig").find(tree, error.AmbiguousChartView3DOwner) orelse return null;
    var result: ?Settings = null;
    var child = tree.elements[chart].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(uri, "view3D")) continue;
        if (result != null) return error.DuplicateChartView3D;
        var value: Settings = .{ .node = node };
        var inner = tree.elements[node].first_child;
        while (inner) |leaf| : (inner = tree.elements[leaf].next_sibling) {
            const element = tree.elements[leaf];
            if (element.is(uri, "rotX")) {
                if (value.rotation_x != null) return error.DuplicateChartView3D;
                value.rotation_x = try numeric(i32, a, tree, leaf, limit, -90, 90);
            } else if (element.is(uri, "rotY")) {
                if (value.rotation_y != null) return error.DuplicateChartView3D;
                value.rotation_y = try numeric(u32, a, tree, leaf, limit, 0, 360);
            } else if (element.is(uri, "hPercent")) {
                if (value.height_percent != null) return error.DuplicateChartView3D;
                value.height_percent = try numeric(u32, a, tree, leaf, limit, 5, 500);
            } else if (element.is(uri, "depthPercent")) {
                if (value.depth_percent != null) return error.DuplicateChartView3D;
                value.depth_percent = try numeric(u32, a, tree, leaf, limit, 20, 2000);
            } else if (element.is(uri, "perspective")) {
                if (value.perspective != null) return error.DuplicateChartView3D;
                value.perspective = try numeric(u32, a, tree, leaf, limit, 0, 240);
            } else if (element.is(uri, "rAngAx")) {
                if (value.right_angle_axes != null) return error.DuplicateChartView3D;
                value.right_angle_axes = try scalar.read(bool, a, tree, leaf, limit, error.InvalidChartView3D);
            } else value.unparsed_children = true;
        }
        result = value;
    }
    return result;
}

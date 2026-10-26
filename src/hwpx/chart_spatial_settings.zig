//! 3D plot-owned gap/shape; independent from chart-owned camera settings.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
pub const Shape = enum { box, cone, coneToMax, cylinder, pyramid, pyramidToMax };
pub const Settings = struct { gap_depth: ?scalar.Field(u32) = null, shape: ?scalar.Field(Shape) = null };
pub fn read(a: std.mem.Allocator, tree: *const Tree, plot: usize, limit: usize) !?Settings {
    const kind = @import("chart_plot_kind.zig").selected(tree, plot) orelse return error.InvalidChartPlot;
    const spatial = kind == .bar3DChart or kind == .line3DChart or kind == .area3DChart;
    var output: Settings = .{};
    var child = tree.elements[plot].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        if (element.is(uri, "gapDepth")) {
            if (!spatial) return error.InvalidChartSpatialSetting;
            if (output.gap_depth != null) return error.DuplicateChartSpatialSetting;
            const gap = try scalar.read(u32, a, tree, node, limit, error.InvalidChartSpatialSetting);
            if (gap.value) |value| if (value > 500) return error.InvalidChartSpatialSetting;
            output.gap_depth = gap;
        } else if (element.is(uri, "shape")) {
            if (kind != .bar3DChart) return error.InvalidChartSpatialSetting;
            if (output.shape != null) return error.DuplicateChartSpatialSetting;
            output.shape = try scalar.read(Shape, a, tree, node, limit, error.InvalidChartSpatialSetting);
        }
    }
    return if (spatial) output else null;
}

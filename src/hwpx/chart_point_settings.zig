//! Direct dPt identity and explosion fields; other point styling stays explicit.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const Plot = @import("chart_plot_values.zig").Plot;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
pub const Setting = struct {
    node: usize,
    series_node: usize,
    plot_node: usize,
    index: ?scalar.Field(u32) = null,
    explosion: ?scalar.Field(u32) = null,
    unparsed_children: bool = false,
};
pub const Options = struct { max_points: usize = 100_000, max_attribute_bytes: usize = scalar.default_max_attribute_bytes };
pub const Values = struct {
    items: []Setting,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.items);
        self.* = undefined;
    }
};

pub fn collect(a: std.mem.Allocator, tree: *const Tree, plots: []const Plot, options: Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var values: std.ArrayList(Setting) = .empty;
    defer values.deinit(a);
    for (plots) |plot| for (plot.series_nodes) |series| {
        if (series >= tree.elements.len or tree.elements[series].parent != plot.node or !tree.elements[series].is(uri, "ser")) return error.InvalidChartSeriesOwner;
        var child = tree.elements[series].first_child;
        while (child) |node| {
            const element = tree.elements[node];
            if (element.is(uri, "dPt")) {
                if (values.items.len == options.max_points) return error.LimitExceeded;
                var value: Setting = .{ .node = node, .series_node = series, .plot_node = plot.node };
                var leaf = element.first_child;
                while (leaf) |index| {
                    const item = tree.elements[index];
                    if (item.is(uri, "idx")) {
                        if (value.index != null) return error.DuplicateChartPointSetting;
                        value.index = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartPointSetting);
                    } else if (item.is(uri, "explosion")) {
                        if (value.explosion != null) return error.DuplicateChartPointSetting;
                        value.explosion = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartPointSetting);
                    } else value.unparsed_children = true;
                    leaf = item.next_sibling;
                }
                try values.append(a, value);
            }
            child = element.next_sibling;
        }
    };
    return .{ .items = try values.toOwnedSlice(a) };
}

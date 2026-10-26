//! Series-local marker and smoothing values; no display defaults or save cache.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
const scalar = @import("chart_scalar_field.zig");
const Plot = @import("chart_plot_values.zig").Plot;
pub const Symbol = enum { auto, circle, dash, diamond, dot, none, picture, plus, square, star, triangle, x };
pub const Marker = struct { node: usize, symbol: ?scalar.Field(Symbol) = null, size: ?scalar.Field(u32) = null };
pub const Setting = struct { series_node: usize, plot_node: usize, index: ?scalar.Field(u32) = null, order: ?scalar.Field(u32) = null, marker: ?Marker = null, smooth: ?scalar.Field(bool) = null, explosion: ?scalar.Field(u32) = null, stroke: ?@import("chart_series_stroke.zig").Stroke = null };
pub const Options = struct { max_series: usize = 100_000, max_attribute_bytes: usize = scalar.default_max_attribute_bytes };
pub const Values = struct {
    items: []Setting,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.items);
        self.* = undefined;
    }
};

fn marker(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Marker {
    var value: Marker = .{ .node = node };
    var child = tree.elements[node].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "symbol")) {
            if (value.symbol != null) return error.DuplicateChartSeriesSetting;
            value.symbol = try scalar.read(Symbol, a, tree, index, limit, error.InvalidChartSeriesSetting);
        } else if (element.is(uri, "size")) {
            if (value.size != null) return error.DuplicateChartSeriesSetting;
            const size = try scalar.read(u32, a, tree, index, limit, error.InvalidChartSeriesSetting);
            if (size.value) |number| if (number < 2 or number > 72) return error.InvalidChartSeriesSetting;
            value.size = size;
        }
        child = element.next_sibling;
    }
    return value;
}

pub fn collect(a: std.mem.Allocator, tree: *const Tree, plots: []const Plot, options: Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var values: std.ArrayList(Setting) = .empty;
    defer values.deinit(a);
    for (plots) |plot| for (plot.series_nodes) |node| {
        if (node >= tree.elements.len or tree.elements[node].parent != plot.node or !tree.elements[node].is(uri, "ser")) return error.InvalidChartSeriesOwner;
        if (values.items.len == options.max_series) return error.LimitExceeded;
        var value: Setting = .{ .series_node = node, .plot_node = plot.node };
        var properties_seen = false;
        const line = plot.kind == .lineChart or plot.kind == .line3DChart or plot.kind == .stockChart or plot.kind == .scatterChart;
        var child = tree.elements[node].first_child;
        while (child) |index| {
            const element = tree.elements[index];
            if (element.is(uri, "spPr")) {
                if (properties_seen) return error.DuplicateChartSeriesSetting;
                properties_seen = true;
                value.stroke = try @import("chart_series_stroke.zig").read(tree, index);
            } else if (element.is(uri, "idx")) {
                if (value.index != null) return error.DuplicateChartSeriesSetting;
                value.index = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartSeriesSetting);
            } else if (element.is(uri, "order")) {
                if (value.order != null) return error.DuplicateChartSeriesSetting;
                value.order = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartSeriesSetting);
            } else if (element.is(uri, "marker")) {
                if (!line and plot.kind != .radarChart) return error.InvalidChartSeriesSetting;
                if (value.marker != null) return error.DuplicateChartSeriesSetting;
                value.marker = try marker(a, tree, index, options.max_attribute_bytes);
            } else if (element.is(uri, "smooth")) {
                if (!line) return error.InvalidChartSeriesSetting;
                if (value.smooth != null) return error.DuplicateChartSeriesSetting;
                value.smooth = try scalar.read(bool, a, tree, index, options.max_attribute_bytes, error.InvalidChartSeriesSetting);
            } else if (element.is(uri, "explosion")) {
                if (plot.kind != .pieChart and plot.kind != .pie3DChart and plot.kind != .ofPieChart and plot.kind != .doughnutChart) return error.InvalidChartSeriesSetting;
                if (value.explosion != null) return error.DuplicateChartSeriesSetting;
                value.explosion = try scalar.read(u32, a, tree, index, options.max_attribute_bytes, error.InvalidChartSeriesSetting);
            }
            child = element.next_sibling;
        }
        try values.append(a, value);
    };
    return .{ .items = try values.toOwnedSlice(a) };
}

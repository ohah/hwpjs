//! Explicit plot settings. Missing element and missing val stay distinct.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const Kind = @import("chart_plot_kind.zig").Kind;
const uri = @import("chart_namespace.zig").uri;
pub const Direction = enum { bar, col };
pub const Grouping = enum { standard, clustered, stacked, percentStacked };
pub const ScatterStyle = enum { line, lineMarker, marker, smooth, smoothMarker };
pub const OfPieType = enum { pie, bar };
// MS-OE376 2.1.1645 distinguishes standard auto from Office's narrower profile.
pub const SplitType = enum { auto, cust, percent, pos, val };
pub const Field = @import("chart_scalar_field.zig").Field;
pub const Options = struct { max_axis_references: usize = 16, max_attribute_bytes: usize = @import("chart_scalar_field.zig").default_max_attribute_bytes };
pub const Settings = struct {
    direction: ?Field(Direction) = null,
    grouping: ?Field(Grouping) = null,
    vary_colors: ?Field(bool) = null,
    gap_width: ?Field(u32) = null,
    overlap: ?Field(i32) = null,
    scatter_style: ?Field(ScatterStyle) = null,
    first_slice_angle: ?Field(u32) = null,
    of_pie_type: ?Field(OfPieType) = null,
    second_pie_size: ?Field(u32) = null,
    split_type: ?Field(SplitType) = null,
    split_position: ?Field(@import("chart_scalar_field.zig").Number) = null,
    custom_split_node: ?usize = null,
    stock: ?@import("chart_stock_settings.zig").Settings = null,
    spatial: ?@import("chart_spatial_settings.zig").Settings = null,
    axis_references: []Field(u32),
    pub fn deinit(self: *Settings, a: std.mem.Allocator) void {
        a.free(self.axis_references);
        self.* = undefined;
    }
};

fn field(comptime T: type, a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Field(T) {
    return @import("chart_scalar_field.zig").read(T, a, tree, node, limit, error.InvalidChartPlotSetting);
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, plot: usize, options: Options) !Settings {
    const plot_kind = @import("chart_plot_kind.zig").selected(tree, plot) orelse return error.InvalidChartPlot;
    var output: Settings = .{ .axis_references = &.{} };
    output.spatial = try @import("chart_spatial_settings.zig").read(a, tree, plot, options.max_attribute_bytes);
    if (plot_kind == .stockChart) output.stock = try @import("chart_stock_settings.zig").read(a, tree, plot, options.max_attribute_bytes);
    var axes: std.ArrayList(Field(u32)) = .empty;
    defer axes.deinit(a);
    const bar = plot_kind == Kind.barChart or plot_kind == Kind.bar3DChart;
    const grouped = bar or plot_kind == .lineChart or plot_kind == .line3DChart or plot_kind == .areaChart or plot_kind == .area3DChart;
    var child = tree.elements[plot].first_child;
    while (child) |node| {
        const element = tree.elements[node];
        if (element.is(uri, "barDir")) {
            if (!bar) return error.InvalidChartPlotSetting;
            if (output.direction != null) return error.DuplicateChartPlotSetting;
            output.direction = try field(Direction, a, tree, node, options.max_attribute_bytes);
        } else if (element.is(uri, "grouping")) {
            if (!grouped) return error.InvalidChartPlotSetting;
            if (output.grouping != null) return error.DuplicateChartPlotSetting;
            const grouping = try field(Grouping, a, tree, node, options.max_attribute_bytes);
            if (!bar and grouping.value == Grouping.clustered) return error.InvalidChartPlotSetting;
            output.grouping = grouping;
        } else if (element.is(uri, "varyColors")) {
            if (output.vary_colors != null) return error.DuplicateChartPlotSetting;
            output.vary_colors = try field(bool, a, tree, node, options.max_attribute_bytes);
        } else if (element.is(uri, "gapWidth")) {
            if (!bar and plot_kind != .ofPieChart) return error.InvalidChartPlotSetting;
            if (output.gap_width != null) return error.DuplicateChartPlotSetting;
            const gap = try field(u32, a, tree, node, options.max_attribute_bytes);
            if (gap.value) |value| if (value > 500) return error.InvalidChartPlotSetting;
            output.gap_width = gap;
        } else if (element.is(uri, "overlap")) {
            if (plot_kind != .barChart) return error.InvalidChartPlotSetting;
            if (output.overlap != null) return error.DuplicateChartPlotSetting;
            const overlap = try field(i32, a, tree, node, options.max_attribute_bytes);
            if (overlap.value) |value| if (value < -100 or value > 100) return error.InvalidChartPlotSetting;
            output.overlap = overlap;
        } else if (element.is(uri, "scatterStyle")) {
            if (plot_kind != .scatterChart) return error.InvalidChartPlotSetting;
            if (output.scatter_style != null) return error.DuplicateChartPlotSetting;
            output.scatter_style = try field(ScatterStyle, a, tree, node, options.max_attribute_bytes);
        } else if (element.is(uri, "firstSliceAng")) {
            if (plot_kind != .pieChart and plot_kind != .doughnutChart) return error.InvalidChartPlotSetting;
            if (output.first_slice_angle != null) return error.DuplicateChartPlotSetting;
            const angle = try field(u32, a, tree, node, options.max_attribute_bytes);
            if (angle.value) |value| if (value > 360) return error.InvalidChartPlotSetting;
            output.first_slice_angle = angle;
        } else if (element.is(uri, "ofPieType")) {
            if (plot_kind != .ofPieChart) return error.InvalidChartPlotSetting;
            if (output.of_pie_type != null) return error.DuplicateChartPlotSetting;
            output.of_pie_type = try field(OfPieType, a, tree, node, options.max_attribute_bytes);
        } else if (element.is(uri, "secondPieSize")) {
            if (plot_kind != .ofPieChart) return error.InvalidChartPlotSetting;
            if (output.second_pie_size != null) return error.DuplicateChartPlotSetting;
            const size = try field(u32, a, tree, node, options.max_attribute_bytes);
            if (size.value) |value| if (value < 5 or value > 200) return error.InvalidChartPlotSetting;
            output.second_pie_size = size;
        } else if (element.is(uri, "splitType")) {
            if (plot_kind != .ofPieChart) return error.InvalidChartPlotSetting;
            if (output.split_type != null) return error.DuplicateChartPlotSetting;
            output.split_type = try field(SplitType, a, tree, node, options.max_attribute_bytes);
        } else if (element.is(uri, "splitPos")) {
            if (plot_kind != .ofPieChart) return error.InvalidChartPlotSetting;
            if (output.split_position != null) return error.DuplicateChartPlotSetting;
            output.split_position = try field(@import("chart_scalar_field.zig").Number, a, tree, node, options.max_attribute_bytes);
        } else if (element.is(uri, "custSplit")) {
            if (plot_kind != .ofPieChart) return error.InvalidChartPlotSetting;
            if (output.custom_split_node != null) return error.DuplicateChartPlotSetting;
            output.custom_split_node = node;
        } else if (element.is(uri, "axId")) {
            if (axes.items.len == options.max_axis_references) return error.LimitExceeded;
            const axis = try field(u32, a, tree, node, options.max_attribute_bytes);
            if (axis.value) |id| for (axes.items) |before| {
                if (before.value == id) return error.DuplicateChartAxisReference;
            };
            try axes.append(a, axis);
        }
        child = element.next_sibling;
    }
    output.axis_references = try axes.toOwnedSlice(a);
    return output;
}

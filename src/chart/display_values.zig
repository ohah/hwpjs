//! Chart XML values only; physical document/container owners stay in format adapters.
const std = @import("std");
const Tree = @import("../hwpx/chart_tree.zig").Tree;
const Points = @import("../hwpx/chart_point_values.zig");
const Series = @import("../hwpx/chart_series_text_values.zig");
const Rich = @import("../hwpx/chart_rich_text_values.zig");
const Plots = @import("../hwpx/chart_plot_values.zig");
const Settings = @import("../hwpx/chart_plot_settings.zig");
const SeriesSettings = @import("../hwpx/chart_series_settings.zig");
const PointSettings = @import("../hwpx/chart_point_settings.zig");
const Axes = @import("../hwpx/chart_axis_values.zig");
const AxisLinks = @import("../hwpx/chart_axis_links.zig");
pub const Values = struct {
    view_3d: ?@import("../hwpx/chart_view_3d.zig").Settings = null,
    blank_policy: ?@import("../hwpx/chart_blank_policy.zig").Field = null,
    plots: Plots.Values,
    plot_settings: []Settings.Settings,
    series_settings: SeriesSettings.Values,
    point_settings: PointSettings.Values,
    axes: Axes.Values,
    axis_links: []AxisLinks.Link,
    points: Points.Values,
    bindings: []@import("../hwpx/chart_point_roles.zig").Binding,
    series_text: Series.Values,
    rich_text: Rich.Values,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        deinitFields(self, a);
    }
};
pub const Headers = struct {
    view_3d: ?@import("../hwpx/chart_view_3d.zig").Settings,
    blank_policy: ?@import("../hwpx/chart_blank_policy.zig").Field,
};
pub const Overrides = struct {
    points: ?*const Points.Values = null,
    series_text: ?*const Series.Values = null,
    rich_text: ?*const Rich.Values = null,
};

// Also serves the existing flat HWPX Snapshot without changing its public fields.
pub fn deinitFields(self: anytype, a: std.mem.Allocator) void {
    self.plots.deinit(a);
    for (self.plot_settings) |*setting| setting.deinit(a);
    a.free(self.plot_settings);
    self.series_settings.deinit(a);
    self.point_settings.deinit(a);
    self.axes.deinit(a);
    a.free(self.axis_links);
    self.points.deinit(a);
    a.free(self.bindings);
    self.series_text.deinit(a);
    self.rich_text.deinit(a);
    self.* = undefined;
}
fn textValues(comptime M: type, a: std.mem.Allocator, tree: *const Tree, current: ?*const M.Values) !M.Values {
    if (current) |value| {
        try value.validateSource(tree);
        return value.clone(a);
    }
    return M.collect(a, tree, .{});
}
pub fn readHeaders(a: std.mem.Allocator, tree: *const Tree) !Headers {
    return .{
        .view_3d = try @import("../hwpx/chart_view_3d.zig").read(a, tree, @import("../hwpx/chart_scalar_field.zig").default_max_attribute_bytes),
        .blank_policy = try @import("../hwpx/chart_blank_policy.zig").read(a, tree, @import("../hwpx/chart_scalar_field.zig").default_max_attribute_bytes),
    };
}
pub fn collectBody(a: std.mem.Allocator, tree: *const Tree, headers: Headers, overrides: Overrides) !Values {
    var plots = try Plots.collect(a, tree, .{});
    errdefer plots.deinit(a);
    const plot_settings = try a.alloc(Settings.Settings, plots.plots.len);
    errdefer a.free(plot_settings);
    var initialized: usize = 0;
    errdefer for (plot_settings[0..initialized]) |*setting| setting.deinit(a);
    for (plots.plots, plot_settings) |plot, *setting| {
        setting.* = try Settings.read(a, tree, plot.node, .{});
        initialized += 1;
    }
    var axes = try Axes.collect(a, tree, .{});
    errdefer axes.deinit(a);
    var series_settings = try SeriesSettings.collect(a, tree, plots.plots, .{});
    errdefer series_settings.deinit(a);
    var point_settings = try PointSettings.collect(a, tree, plots.plots, .{});
    errdefer point_settings.deinit(a);
    const axis_links = try AxisLinks.collect(a, plots.plots, plot_settings, &axes, 100_000);
    errdefer a.free(axis_links);
    var points = if (overrides.points) |current| block: {
        try current.validateSource(tree);
        break :block try current.clone(a);
    } else try Points.collect(a, tree, .{});
    errdefer points.deinit(a);
    const bindings = try @import("../hwpx/chart_point_roles.zig").collect(a, tree, &points);
    errdefer a.free(bindings);
    var series = try textValues(Series, a, tree, overrides.series_text);
    errdefer series.deinit(a);
    const rich = try textValues(Rich, a, tree, overrides.rich_text);
    return .{ .view_3d = headers.view_3d, .blank_policy = headers.blank_policy, .plots = plots, .plot_settings = plot_settings, .series_settings = series_settings, .point_settings = point_settings, .axes = axes, .axis_links = axis_links, .points = points, .bindings = bindings, .series_text = series, .rich_text = rich };
}

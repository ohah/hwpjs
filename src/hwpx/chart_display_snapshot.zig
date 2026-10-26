//! Detached display inputs reuse native current owners; never become save state.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const resources = @import("chart_resource_values.zig");
const Points = @import("chart_point_values.zig");
const Series = @import("chart_series_text_values.zig");
const Rich = @import("chart_rich_text_values.zig");
const Plots = @import("chart_plot_values.zig");
const Settings = @import("chart_plot_settings.zig");
const SeriesSettings = @import("chart_series_settings.zig");
const PointSettings = @import("chart_point_settings.zig");
const Axes = @import("chart_axis_values.zig");
const AxisLinks = @import("chart_axis_links.zig");
pub const Snapshot = struct {
    pair: @import("chart_pair_target.zig").Pair,
    host: @import("chart_host_geometry.zig").Values,
    view_3d: ?@import("chart_view_3d.zig").Settings = null,
    blank_policy: ?@import("chart_blank_policy.zig").Field = null,
    plots: Plots.Values,
    plot_settings: []Settings.Settings,
    series_settings: SeriesSettings.Values,
    point_settings: PointSettings.Values,
    axes: Axes.Values,
    axis_links: []AxisLinks.Link,
    points: Points.Values,
    bindings: []@import("chart_point_roles.zig").Binding,
    series_text: Series.Values,
    rich_text: Rich.Values,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        self.pair.deinit(a);
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
};

fn textValues(comptime M: type, comptime field: []const u8, a: std.mem.Allocator, tree: *const Tree, entry: ?*resources.Entry) !M.Values {
    if (entry) |current| if (@field(current, field)) |text| {
        try text.validateSource(tree);
        return text.clone(a);
    };
    return M.collect(a, tree, .{});
}

pub fn read(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, section: usize, wrapper: usize) !Snapshot {
    var source = try @import("chart_source_context.zig").load(a, session, section, wrapper);
    defer source.tree.deinit(a);
    errdefer source.pair.deinit(a);
    const host = try @import("chart_host_geometry.zig").read(a, &session.sections[section].tree, wrapper);
    const view_3d = try @import("chart_view_3d.zig").read(a, &source.tree, @import("chart_scalar_field.zig").default_max_attribute_bytes);
    const blank_policy = try @import("chart_blank_policy.zig").read(a, &source.tree, @import("chart_scalar_field.zig").default_max_attribute_bytes);
    const current = try session.chart_resources.find(source.pair.chart_path, source.pair.ole_path);
    var plots = try Plots.collect(a, &source.tree, .{});
    errdefer plots.deinit(a);
    const plot_settings = try a.alloc(Settings.Settings, plots.plots.len);
    errdefer a.free(plot_settings);
    var initialized: usize = 0;
    errdefer for (plot_settings[0..initialized]) |*setting| setting.deinit(a);
    for (plots.plots, plot_settings) |plot, *setting| {
        setting.* = try Settings.read(a, &source.tree, plot.node, .{});
        initialized += 1;
    }
    var axes = try Axes.collect(a, &source.tree, .{});
    errdefer axes.deinit(a);
    var series_settings = try SeriesSettings.collect(a, &source.tree, plots.plots, .{});
    errdefer series_settings.deinit(a);
    var point_settings = try PointSettings.collect(a, &source.tree, plots.plots, .{});
    errdefer point_settings.deinit(a);
    const axis_links = try AxisLinks.collect(a, plots.plots, plot_settings, &axes, 100_000);
    errdefer a.free(axis_links);
    var points = if (current) |entry| block: {
        try entry.points.validateSource(&source.tree);
        break :block try entry.points.clone(a);
    } else try Points.collect(a, &source.tree, .{});
    errdefer points.deinit(a);
    const bindings = try @import("chart_point_roles.zig").collect(a, &source.tree, &points);
    errdefer a.free(bindings);
    var series = try textValues(Series, "series_text", a, &source.tree, current);
    errdefer series.deinit(a);
    const rich = try textValues(Rich, "rich_text", a, &source.tree, current);
    return .{ .pair = source.pair, .host = host, .view_3d = view_3d, .blank_policy = blank_policy, .plots = plots, .plot_settings = plot_settings, .series_settings = series_settings, .point_settings = point_settings, .axes = axes, .axis_links = axis_links, .points = points, .bindings = bindings, .series_text = series, .rich_text = rich };
}

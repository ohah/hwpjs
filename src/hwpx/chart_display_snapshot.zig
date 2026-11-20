//! Detached display inputs reuse native current owners; never become save state.
const std = @import("std");
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
        @import("../chart/display_values.zig").deinitFields(self, a);
    }
};

pub fn read(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, section: usize, wrapper: usize) !Snapshot {
    var source = try @import("chart_source_context.zig").load(a, session, section, wrapper);
    defer source.tree.deinit(a);
    errdefer source.pair.deinit(a);
    const host = try @import("chart_host_geometry.zig").read(a, &session.sections[section].tree, wrapper);
    const common = @import("../chart/display_values.zig");
    const headers = try common.readHeaders(a, &source.tree);
    const current = try session.chart_resources.find(source.pair.chart_path, source.pair.ole_path);
    const values = try common.collectBody(a, &source.tree, headers, .{
        .points = if (current) |entry| &entry.points else null,
        .series_text = if (current) |entry| if (entry.series_text) |*value| value else null else null,
        .rich_text = if (current) |entry| if (entry.rich_text) |*value| value else null else null,
    });
    return .{ .pair = source.pair, .host = host, .view_3d = values.view_3d, .blank_policy = values.blank_policy, .plots = values.plots, .plot_settings = values.plot_settings, .series_settings = values.series_settings, .point_settings = values.point_settings, .axes = values.axes, .axis_links = values.axis_links, .points = values.points, .bindings = values.bindings, .series_text = values.series_text, .rich_text = values.rich_text };
}

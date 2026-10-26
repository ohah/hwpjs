//! Link explicit plot references to definitions without fallback axes.
const std = @import("std");
const Axes = @import("chart_axis_values.zig");
pub const Link = struct { plot_node: usize, reference_node: usize, id: ?u32, target: Axes.Link };
pub fn collect(a: std.mem.Allocator, plots: []const @import("chart_plot_values.zig").Plot, settings: []const @import("chart_plot_settings.zig").Settings, axes: *const Axes.Values, max_links: usize) ![]Link {
    if (plots.len != settings.len) return error.InvalidChartPlotSettings;
    var links: std.ArrayList(Link) = .empty;
    defer links.deinit(a);
    for (plots, settings) |plot, configuration| {
        for (configuration.axis_references) |reference| {
            if (links.items.len == max_links) return error.LimitExceeded;
            try links.append(a, .{ .plot_node = plot.node, .reference_node = reference.node, .id = reference.value, .target = axes.resolve(plot.area_node, reference.value) });
        }
    }
    return links.toOwnedSlice(a);
}

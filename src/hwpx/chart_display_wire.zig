//! One bounded wire projection; no raw source/cache/checkpoint ownership.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, snapshot: *const @import("chart_display_snapshot.zig").Snapshot, max_bytes: usize) ![]u8 {
    return @import("../json/bounded_stringify.zig").encode(a, .{
        .kind = "chart_display",
        .pair = snapshot.pair,
        .host = snapshot.host,
        .view_3d = snapshot.view_3d,
        .blank_policy = snapshot.blank_policy,
        .plots = snapshot.plots.plots,
        .plot_settings = snapshot.plot_settings,
        .series_settings = snapshot.series_settings.items,
        .point_settings = snapshot.point_settings.items,
        .axes = snapshot.axes.items,
        .axis_links = snapshot.axis_links,
        .points = snapshot.points.points,
        .bindings = snapshot.bindings,
        .series_text = snapshot.series_text.items,
        .rich_text = snapshot.rich_text.items,
    }, max_bytes);
}

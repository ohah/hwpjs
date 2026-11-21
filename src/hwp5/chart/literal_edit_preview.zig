//! Native data for the existing shared painter. Read preparation never grants edit authority.
const std = @import("std");
pub fn write(a: std.mem.Allocator, prepared: *const @import("literal_edit_xml.zig").Prepared, width: u32, height: u32, limit: usize) ![]u8 {
    const v = &prepared.values;
    return @import("../../json/bounded_stringify.zig").encode(a, .{
        .schemaVersion = @as(u32, 1),
        .scope = "hwp5-chart-literal-edit-preview",
        .executionAuthority = false,
        .changed = prepared.changed,
        .xml_sha256 = prepared.sha256,
        .pixel_width = width,
        .pixel_height = height,
        .data = .{
            .view_3d = v.view_3d,
            .blank_policy = v.blank_policy,
            .plots = v.plots.plots,
            .plot_settings = v.plot_settings,
            .series_settings = v.series_settings.items,
            .point_settings = v.point_settings.items,
            .axes = v.axes.items,
            .axis_links = v.axis_links,
            .points = v.points.points,
            .bindings = v.bindings,
            .series_text = v.series_text.items,
            .rich_text = v.rich_text.items,
        },
    }, limit);
}

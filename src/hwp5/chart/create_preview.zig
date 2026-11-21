//! Values for the actual shared preview painter, derived from authored chart XML.
//! No document owner, save capability, synthetic raster, or preview cache is read.
const std = @import("std");
pub fn write(a: std.mem.Allocator, data: @import("../../hwpx/chart_create_data.zig").Data, limit: usize) ![]u8 {
    return writeFor(a, data, .spec24_registered_png_presentation_v1, limit);
}
pub fn writeFor(a: std.mem.Allocator, data: @import("../../hwpx/chart_create_data.zig").Data, profile: @import("create_profile.zig").Profile, limit: usize) ![]u8 {
    const xml = try @import("create_profile.zig").create(a, data, profile);
    defer a.free(xml);
    var tree = try @import("../../hwpx/chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    const common = @import("../../chart/display_values.zig");
    var values = try common.collectBody(a, &tree, try common.readHeaders(a, &tree), .{});
    defer values.deinit(a);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
    return @import("../../json/bounded_stringify.zig").encode(a, .{
        .schemaVersion = @as(u32, 1),
        .scope = "hwp5-chart-create-preview",
        .executionAuthority = false,
        .xml_sha256 = digest,
        .data = .{
            .view_3d = values.view_3d,
            .blank_policy = values.blank_policy,
            .plots = values.plots.plots,
            .plot_settings = values.plot_settings,
            .series_settings = values.series_settings.items,
            .point_settings = values.point_settings.items,
            .axes = values.axes.items,
            .axis_links = values.axis_links,
            .points = values.points.points,
            .bindings = values.bindings,
            .series_text = values.series_text.items,
            .rich_text = values.rich_text.items,
        },
    }, limit);
}

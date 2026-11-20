//! HWP5-specific ownership envelope around the shared chart data; no HWPX aliases.
const std = @import("std");
pub const version: u32 = 1;
pub fn candidates(a: std.mem.Allocator, epoch: u64, revision: ?u32, rows: []const @import("candidate_snapshot.zig").Candidate, max_bytes: usize) ![]u8 {
    const generation = try std.fmt.allocPrint(a, "{d}", .{epoch});
    defer a.free(generation);
    return @import("../../json/bounded_stringify.zig").encode(a, .{
        .kind = "hwp5_chart_candidates",
        .format = "hwp5",
        .version = version,
        .source_epoch = generation,
        .history_revision = revision,
        .candidates = rows,
    }, max_bytes);
}
pub fn display(a: std.mem.Allocator, epoch: u64, revision: ?u32, snapshot: *const @import("display_snapshot.zig").Snapshot, max_bytes: usize) ![]u8 {
    const physical = snapshot.physical_id orelse return error.MissingChartPhysicalBinding;
    const generation = try std.fmt.allocPrint(a, "{d}", .{epoch});
    defer a.free(generation);
    return @import("../../json/bounded_stringify.zig").encode(a, .{
        .kind = "hwp5_chart_display",
        .format = "hwp5",
        .version = version,
        .section = snapshot.section,
        .source_epoch = generation,
        .history_revision = revision,
        .owner = snapshot.owner,
        .resource_sha256 = snapshot.resource_sha256,
        .physical_id = physical,
        .stream_entry = snapshot.stream_entry,
        .legacy_backup_present = snapshot.legacy_backup_present,
        .presentation_streams = snapshot.presentation_streams,
        .data = .{
            .view_3d = snapshot.values.view_3d,
            .blank_policy = snapshot.values.blank_policy,
            .plots = snapshot.values.plots.plots,
            .plot_settings = snapshot.values.plot_settings,
            .series_settings = snapshot.values.series_settings.items,
            .point_settings = snapshot.values.point_settings.items,
            .axes = snapshot.values.axes.items,
            .axis_links = snapshot.values.axis_links,
            .points = snapshot.values.points.points,
            .bindings = snapshot.values.bindings,
            .series_text = snapshot.values.series_text.items,
            .rich_text = snapshot.values.rich_text.items,
        },
    }, max_bytes);
}

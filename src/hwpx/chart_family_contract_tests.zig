//! Authored tests; Native compile/execution remains zero until exact slot grant.
const std = @import("std");
const api = @import("chart_create.zig");
const settings = @import("chart_plot_settings.zig");
const a = std.testing.allocator;
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:unknown'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

fn read(allocator: std.mem.Allocator, body: []const u8) !settings.Settings {
    const xml = try std.mem.concat(allocator, u8, &.{ prefix, body, suffix });
    defer allocator.free(xml);
    var tree = try @import("chart_tree.zig").parse(allocator, xml, 0, .{});
    defer tree.deinit(allocator);
    var plots = try @import("chart_plot_values.zig").collect(allocator, &tree, .{});
    defer plots.deinit(allocator);
    const result = try settings.read(allocator, &tree, plots.plots[0].node, .{});
    errdefer {
        var owned = result;
        owned.deinit(allocator);
    }
    try std.testing.expectEqualStrings(xml, tree.source);
    return result;
}
test "HWPX chart family raw absent empty zero ranges and strict owner kinds" {
    var absent = try read(a, "<c:bubbleChart/>");
    defer absent.deinit(a);
    try std.testing.expect(absent.bubble_scale == null);
    try std.testing.expectEqual(false, absent.family_unparsed_children.?);
    var empty = try read(a, "<c:bubbleChart><c:bubbleScale/><c:bubble3D val='0'/></c:bubbleChart>");
    defer empty.deinit(a);
    try std.testing.expect(empty.bubble_scale != null and empty.bubble_scale.?.value == null);
    try std.testing.expectEqual(false, empty.bubble_3d.?.value.?);
    try std.testing.expect(empty.bubble_3d.?.node != empty.bubble_scale.?.node);
    var zero = try read(a, "<c:bubbleChart><c:bubbleScale val='0'/><c:sizeRepresents val='w'/></c:bubbleChart>");
    defer zero.deinit(a);
    try std.testing.expectEqual(@as(u32, 0), zero.bubble_scale.?.value.?);
    try std.testing.expectEqual(.w, zero.size_represents.?.value.?);
    for ([_][]const u8{
        "<c:doughnutChart><c:holeSize val='9'/></c:doughnutChart>",
        "<c:doughnutChart><c:holeSize val='91'/></c:doughnutChart>",
        "<c:bubbleChart><c:bubbleScale val='301'/></c:bubbleChart>",
        "<c:radarChart><c:radarStyle val='polygon'/></c:radarChart>",
        "<c:bubbleChart><c:sizeRepresents val='diameter'/></c:bubbleChart>",
        "<c:barChart><c:holeSize val='50'/></c:barChart>",
        "<c:pieChart><c:wireframe val='0'/></c:pieChart>",
    }) |body| try std.testing.expectError(error.InvalidChartFamilySetting, read(a, body));
    try std.testing.expectError(error.DuplicateChartFamilySetting, read(a, "<c:doughnutChart><c:holeSize/><c:holeSize/></c:doughnutChart>"));
    try std.testing.expectError(error.InvalidChartFamilySetting, read(a, "<c:doughnutChart><c:holeSize val='50'><c:ext/></c:holeSize></c:doughnutChart>"));
    var scatter = try read(a, "<c:scatterChart><c:scatterStyle val='none'/></c:scatterChart>");
    defer scatter.deinit(a);
    try std.testing.expectEqual(.none, scatter.scatter_style.?.value.?);
}
fn coverageCase(allocator: std.mem.Allocator) !void {
    for ([_][]const u8{
        "<c:bubbleChart><c:bubble3D val='0'/><c:ser><c:bubble3D val='1'/></c:ser></c:bubbleChart>",
        "<c:bubbleChart><c:bubble3D val='0'/><c:ser><c:dPt><c:idx val='0'/><c:bubble3D val='1'/></c:dPt></c:ser></c:bubbleChart>",
        "<c:surfaceChart><c:wireframe val='0'/><c:bandFmts/></c:surfaceChart>",
        "<c:radarChart><c:radarStyle val='marker'/><c:ser><c:marker><c:symbol val='square'/></c:marker></c:ser></c:radarChart>",
        "<c:radarChart><c:radarStyle val='marker'/><c:ser><c:marker><c:symbol val='circle'/><c:size val='10'/></c:marker></c:ser></c:radarChart>",
        "<c:doughnutChart><c:holeSize val='50'/><c:ser><c:dPt><c:idx val='0'/><c:explosion val='1'/></c:dPt></c:ser></c:doughnutChart>",
        "<c:surface3DChart><x:unknown/></c:surface3DChart>",
        "<c:bubbleChart><c:ser><c:xVal><c:numLit><c:extLst/></c:numLit></c:xVal></c:ser></c:bubbleChart>",
        "<c:surfaceChart><c:ser><c:cat><c:strLit><x:style/></c:strLit></c:cat></c:ser></c:surfaceChart>",
    }) |body| {
        var value = try read(allocator, body);
        defer value.deinit(allocator);
        try std.testing.expectEqual(true, value.family_unparsed_children.?);
        if (value.bubble_3d) |field| try std.testing.expectEqual(false, field.value.?);
    }
    var clean = try read(allocator, "<c:radarChart><c:radarStyle val='marker'/><c:ser><c:marker><c:symbol val='circle'/></c:marker></c:ser></c:radarChart>");
    defer clean.deinit(allocator);
    try std.testing.expectEqual(false, clean.family_unparsed_children.?);
}
test "HWPX chart family conservative override coverage and allocator failures retain source" {
    try coverageCase(a);
    try @import("../testing/allocation_failures.zig").check(coverageCase, .{});
}

const profiles: []const api.Profile = &.{
    .{ .kind = .barChart, .bar_direction = .col, .grouping = .clustered },
    .{ .kind = .bar3DChart, .bar_direction = .bar, .grouping = .clustered },
    .{ .kind = .lineChart, .grouping = .standard },
    .{ .kind = .line3DChart, .grouping = .standard },
    .{ .kind = .areaChart, .grouping = .standard },
    .{ .kind = .area3DChart, .grouping = .standard },
    .{ .kind = .pieChart },
    .{ .kind = .pie3DChart },
    .{ .kind = .doughnutChart },
    .{ .kind = .ofPieChart, .of_pie_type = .pie },
    .{ .kind = .radarChart, .radar_style = .marker },
    .{ .kind = .scatterChart, .scatter_style = .none },
    .{ .kind = .bubbleChart },
    .{ .kind = .stockChart, .stock_layout = .highLowClose },
    .{ .kind = .surfaceChart, .wireframe = false },
    .{ .kind = .surface3DChart, .wireframe = true },
};
// Every Series backing array below has static storage. Runtime profile selection
// must select a slice, never initialize an array in a returning helper's frame.
const fixture_scatter_series = [_]api.Series{.{
    .name = "XY",
    .values = &.{ "1", "2", "3" },
    .x_values = &.{ "4", "5", "6" },
}};
const fixture_bubble_series = [_]api.Series{.{
    .name = "XY",
    .values = &.{ "1", "2", "3" },
    .x_values = &.{ "4", "5", "6" },
    .bubble_sizes = &.{ "2", "3", "4" },
}};
const fixture_stock_series = [_]api.Series{
    .{ .name = "H", .values = &.{ "9", "9", "9" }, .stock_role = .high },
    .{ .name = "L", .values = &.{ "1", "1", "1" }, .stock_role = .low },
    .{ .name = "C", .values = &.{ "5", "5", "5" }, .stock_role = .close },
};
const fixture_category_series = [_]api.Series{
    .{ .name = "S", .values = &.{ "1", "2", "3" } },
    .{ .name = "T", .values = &.{ "2", "3", "4" } },
};

// Keep a real return boundary so optimization cannot hide escaping local storage.
noinline fn dataFor(p: api.Profile) api.Data {
    return switch (p.kind) {
        .scatterChart => .{ .categories = &.{}, .series = &fixture_scatter_series },
        .bubbleChart => .{ .categories = &.{}, .series = &fixture_bubble_series },
        .stockChart => .{ .categories = &.{ "A", "B", "C" }, .series = &fixture_stock_series },
        else => .{ .categories = &.{ "A", "B", "C" }, .series = if (@import("chart_create_profile.zig").isSurface(p.kind)) &fixture_category_series else fixture_category_series[0..1] },
    };
}

test "HWPX chart family runtime fixture selection retains static series storage after return" {
    for (profiles) |p| {
        const data = dataFor(p);
        const expected: []const api.Series = switch (p.kind) {
            .scatterChart => &fixture_scatter_series,
            .bubbleChart => &fixture_bubble_series,
            .stockChart => &fixture_stock_series,
            .surfaceChart, .surface3DChart => &fixture_category_series,
            else => fixture_category_series[0..1],
        };
        // Check the backing address before dereferencing the returned series.
        // A local-array implementation fails this oracle even if its old frame
        // happens to retain valid-looking names and numeric slices.
        try std.testing.expectEqual(@intFromPtr(expected.ptr), @intFromPtr(data.series.ptr));
        try std.testing.expectEqual(expected.len, data.series.len);
        // Selecting another profile must not mutate the previously returned data.
        const alternate = dataFor(if (p.kind == .bubbleChart) profiles[11] else profiles[12]);
        try std.testing.expect(alternate.series.ptr != data.series.ptr);
        for (data.series, expected) |actual, oracle| {
            try std.testing.expectEqualStrings(oracle.name, actual.name);
            try std.testing.expectEqual(oracle.stock_role, actual.stock_role);
            try std.testing.expectEqual(oracle.values.len, actual.values.len);
            for (actual.values, oracle.values) |value, authored| try std.testing.expectEqualStrings(authored, value);
            try std.testing.expectEqual(oracle.x_values != null, actual.x_values != null);
            if (oracle.x_values) |xs| {
                try std.testing.expectEqual(xs.len, actual.x_values.?.len);
                for (actual.x_values.?, xs) |value, authored| try std.testing.expectEqualStrings(authored, value);
            }
            try std.testing.expectEqual(oracle.bubble_sizes != null, actual.bubble_sizes != null);
            if (oracle.bubble_sizes) |sizes| {
                try std.testing.expectEqual(sizes.len, actual.bubble_sizes.?.len);
                for (actual.bubble_sizes.?, sizes) |value, authored| try std.testing.expectEqualStrings(authored, value);
            }
        }
        try @import("chart_create_data.zig").validateFor(data, p);
    }
    // Selecting static storage must retain strict auxiliary-data admission.
    try std.testing.expectError(error.InvalidChartCreateShape, @import("chart_create_data.zig").validateFor(dataFor(profiles[11]), profiles[12]));
    try std.testing.expectError(error.InvalidChartCreateShape, @import("chart_create_data.zig").validateFor(dataFor(profiles[12]), profiles[11]));
}
test "HWPX chart family all sixteen actual creation reopened Native display JSON and explicit 3D" {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &hash, .{});
    for (profiles) |p| {
        var result = try api.prepare(a, input, .{ .expected_source_sha256 = hash, .target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "" }, .size = .{ .width = 21600, .height = 14400 }, .data = dataFor(p), .chart = p });
        defer result.deinit(a);
        var session = try @import("editor_session.zig").open(a, result.bytes, .{});
        defer session.deinit();
        const before = try session.save();
        defer a.free(before);
        const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
        defer a.free(nodes);
        try std.testing.expectEqual(@as(usize, 1), nodes.len);
        var display = try @import("chart_display_snapshot.zig").read(a, &session, 0, nodes[0]);
        defer display.deinit(a);
        try std.testing.expectEqual(p.kind, display.plots.plots[0].kind);
        const s = display.plot_settings[0];
        if (s.family_unparsed_children) |unparsed| try std.testing.expectEqual(false, unparsed);
        if (p.kind == .doughnutChart) try std.testing.expectEqual(@as(u32, 50), s.hole_size.?.value.?);
        if (p.kind == .radarChart) try std.testing.expectEqual(.marker, s.radar_style.?.value.?);
        if (p.kind == .bubbleChart) {
            try std.testing.expectEqual(false, s.bubble_3d.?.value.?);
            try std.testing.expectEqual(@as(u32, 100), s.bubble_scale.?.value.?);
            try std.testing.expectEqual(.area, s.size_represents.?.value.?);
            try std.testing.expectEqual(false, s.show_negative_bubbles.?.value.?);
        }
        if (p.kind == .surfaceChart or p.kind == .surface3DChart) try std.testing.expectEqual(p.wireframe.?, s.wireframe.?.value.?);
        if (@import("chart_create_profile.zig").is3D(p.kind)) {
            const view = display.view_3d.?;
            try std.testing.expectEqual(@as(u32, 100), view.height_percent.?.value.?);
            try std.testing.expectEqual(@as(u32, 100), view.depth_percent.?.value.?);
            try std.testing.expectEqual(p.kind != .pie3DChart, view.right_angle_axes.?.value.?);
            if (p.kind == .pie3DChart) try std.testing.expectEqual(@as(u32, 30), view.perspective.?.value.?);
        }
        if (p.kind == .bar3DChart or p.kind == .line3DChart or p.kind == .area3DChart) try std.testing.expectEqual(@as(u32, 150), s.spatial.?.gap_depth.?.value.?);
        const bytes = try @import("chart_display_wire.zig").encode(a, &display, 8 * 1024 * 1024);
        defer a.free(bytes);
        var json = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer json.deinit();
        const row = json.value.object.get("plot_settings").?.array.items[0].object;
        inline for (.{ "hole_size", "radar_style", "bubble_scale", "size_represents", "show_negative_bubbles", "bubble_3d", "wireframe", "family_unparsed_children" }) |key| try std.testing.expect(row.contains(key));
        if (p.kind == .bubbleChart) try std.testing.expectEqual(false, row.get("bubble_3d").?.object.get("value").?.bool);
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expectEqualSlices(u8, result.bytes, session.source);
    }
}

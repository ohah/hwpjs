//! Authored creation/reopen cases, not renderer or public SDK evidence.
//! Not executed until Main grants an exact Native slot.
const std = @import("std");
const api = @import("chart_create.zig");
const profiles = @import("chart_create_profile.zig");
const Kind = @import("chart_plot_kind.zig").Kind;
const a = std.testing.allocator;

test "HWPX chart kinds legacy three-field wire has fixed byte oracle" {
    const data: api.Data = .{ .categories = &.{"A"}, .series = &.{.{ .name = "S", .values = &.{"1"} }} };
    const xml = try @import("chart_create_xml.zig").createFor(a, data, null);
    defer a.free(xml);
    try std.testing.expectEqualStrings(@embedFile("chart_create_legacy_golden.xml"), xml);
}

fn profileFor(kind: Kind) api.Profile {
    var p: api.Profile = .{ .kind = kind };
    if (profiles.isBar(kind)) p.bar_direction = .col;
    if (profiles.isGrouped(kind)) p.grouping = if (profiles.isBar(kind)) .clustered else .standard;
    if (kind == .radarChart) p.radar_style = .marker;
    if (kind == .scatterChart) p.scatter_style = .lineMarker;
    if (kind == .ofPieChart) p.of_pie_type = .pie;
    if (kind == .stockChart) p.stock_layout = .highLowClose;
    if (profiles.isSurface(kind)) p.wireframe = false;
    return p;
}
fn dataFor(kind: Kind) api.Data {
    if (profiles.isXY(kind)) return .{
        .categories = &.{},
        .series = if (kind == .bubbleChart) &.{.{ .name = "X&Y", .values = &.{ "-0", "1.25e2" }, .x_values = &.{ "-3.0", "7e1" }, .bubble_sizes = &.{ "0", "4.50" } }} else &.{.{ .name = "X&Y", .values = &.{ "-0", "1.25e2" }, .x_values = &.{ "-3.0", "7e1" } }},
    };
    if (kind == .stockChart) return .{ .categories = &.{ "day1", "day2" }, .series = &.{
        .{ .name = "H", .values = &.{ "10", "20" }, .stock_role = .high },
        .{ .name = "L", .values = &.{ "1", "2" }, .stock_role = .low },
        .{ .name = "C", .values = &.{ "5", "6" }, .stock_role = .close },
    } };
    const rows: []const api.Series = &.{
        .{ .name = "_x0041_😀", .values = &.{ "1.25e2", "0" } },
        .{ .name = " B&< >\r", .values = &.{ "3", "4" } },
    };
    return .{ .categories = &.{ " A&< >\r", "_x0042_😀" }, .series = if (profiles.isPie(kind) and kind != .doughnutChart) rows[0..1] else rows };
}

/// Positive oracle binds exact reopened values to the exact series and roles.
/// It intentionally does not call the new serializer to obtain expectations.
fn reopen(allocator: std.mem.Allocator, xml: []const u8, p: api.Profile, data: api.Data) !void {
    var tree = try @import("chart_tree.zig").parse(allocator, xml, 0, .{});
    defer tree.deinit(allocator);
    var plots = try @import("chart_plot_values.zig").collect(allocator, &tree, .{});
    defer plots.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 1), plots.plots.len);
    const plot = plots.plots[0];
    try std.testing.expectEqual(p.kind, plot.kind);
    try std.testing.expectEqual(data.series.len, plot.series_nodes.len);
    var names = try @import("chart_series_text_values.zig").collect(allocator, &tree, .{});
    defer names.deinit(allocator);
    try std.testing.expectEqual(data.series.len, names.items.len);
    var points = try @import("chart_point_values.zig").collect(allocator, &tree, .{});
    defer points.deinit(allocator);
    const roles = try @import("chart_point_roles.zig").collect(allocator, &tree, &points);
    defer allocator.free(roles);
    var cursor: usize = 0;
    for (data.series, 0..) |series, ordinal| {
        try std.testing.expectEqualStrings(series.name, names.items[ordinal].text);
        const xy = profiles.isXY(p.kind);
        const first = if (xy) series.x_values.? else data.categories;
        const Role = @import("chart_point_roles.zig").Role;
        const expected_roles = [_]Role{ if (xy) .x else .category, if (xy) .y else .value, .bubble_size };
        const expected_values = [_][]const []const u8{ first, series.values, series.bubble_sizes orelse &.{} };
        for (expected_values, expected_roles) |values, role| for (values, 0..) |value, index| {
            try std.testing.expect(cursor < points.points.len);
            try std.testing.expectEqual(role, roles[cursor].role);
            try std.testing.expectEqual(plot.node, roles[cursor].plot_node.?);
            try std.testing.expectEqual(plot.series_nodes[ordinal], roles[cursor].series_node.?);
            try std.testing.expectEqual(@as(u32, @intCast(index)), points.points[cursor].index);
            try std.testing.expectEqualStrings(value, points.points[cursor].value);
            cursor += 1;
        };
    }
    try std.testing.expectEqual(cursor, points.points.len);
}

fn payload(allocator: std.mem.Allocator, p: api.Profile, data: api.Data) !void {
    const xml = try @import("chart_create_xml.zig").createFor(allocator, data, p);
    defer allocator.free(xml);
    try reopen(allocator, xml, p, data);
}
test "HWPX chart kinds all sixteen actual package creation reopen and paired OLE" {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &hash, .{});
    for (std.meta.tags(Kind)) |kind| {
        const p = profileFor(kind);
        const data = dataFor(kind);
        var result = try api.prepare(a, input, .{
            .expected_source_sha256 = hash,
            .target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "" },
            .size = .{ .width = 21600, .height = 14400 },
            .data = data,
            .chart = p,
        });
        defer result.deinit(a);
        // prepare already verifies OPF, host pair and strict OLE stream equality.
        var doc = try @import("package.zig").inspectDocument(a, result.bytes, .{});
        defer doc.deinit(a);
        const entry = doc.archive.find("Chart/hwpjs-created-0.xml").?;
        const xml = try doc.archive.decode(entry, 8 * 1024 * 1024);
        defer a.free(xml);
        try reopen(a, xml, p, data);
    }
}
test "HWPX chart kinds grouping directions scatter radar ofPie and surface variants" {
    for ([_]Kind{ .barChart, .bar3DChart, .lineChart, .line3DChart, .areaChart, .area3DChart }) |kind| {
        for (std.meta.tags(profiles.Grouping)) |grouping| {
            var p = profileFor(kind);
            p.grouping = grouping;
            if (grouping == .clustered and !profiles.isBar(kind)) {
                try std.testing.expectError(error.InvalidChartCreateProfile, profiles.validate(p));
                continue;
            }
            try payload(a, p, dataFor(kind));
            if (profiles.isBar(kind)) {
                p.bar_direction = .bar;
                try payload(a, p, dataFor(kind));
            }
        }
    }
    for (std.meta.tags(profiles.ScatterStyle)) |style| {
        var p = profileFor(.scatterChart);
        p.scatter_style = style;
        try payload(a, p, dataFor(p.kind));
    }
    for (std.meta.tags(profiles.RadarStyle)) |style| {
        var p = profileFor(.radarChart);
        p.radar_style = style;
        try payload(a, p, dataFor(p.kind));
    }
    var ofpie = profileFor(.ofPieChart);
    ofpie.of_pie_type = .bar;
    try payload(a, ofpie, dataFor(ofpie.kind));
    for ([_]Kind{ .surfaceChart, .surface3DChart }) |kind| {
        var p = profileFor(kind);
        p.wireframe = true;
        try payload(a, p, dataFor(kind));
    }
    var stock = profileFor(.stockChart);
    stock.stock_layout = .openHighLowClose;
    const stock_data: api.Data = .{ .categories = &.{ "D1", "D2" }, .series = &.{
        .{ .name = "Open", .stock_role = .open, .values = &.{ "4", "5" } },
        .{ .name = "High", .stock_role = .high, .values = &.{ "9", "10" } },
        .{ .name = "Low", .stock_role = .low, .values = &.{ "1", "2" } },
        .{ .name = "Close", .stock_role = .close, .values = &.{ "6", "7" } },
    } };
    try payload(a, stock, stock_data);
}
test "HWPX chart kinds family serializer allocation failures" {
    for ([_]Kind{ .bar3DChart, .doughnutChart, .bubbleChart, .stockChart, .surface3DChart }) |kind|
        try @import("../testing/allocation_failures.zig").check(payload, .{ profileFor(kind), dataFor(kind) });
}

test "HWPX chart kinds fail closed on absent or irrelevant typed matrices and roles" {
    const validate = @import("chart_create_data.zig").validateFor;
    var missing = dataFor(.scatterChart);
    missing.series = &.{.{ .name = "S", .values = &.{"1"} }};
    try std.testing.expectError(error.InvalidChartCreateShape, validate(missing, profileFor(.scatterChart)));
    missing.series = &.{.{ .name = "S", .values = &.{"1"}, .x_values = &.{ "1", "2" } }};
    try std.testing.expectError(error.InvalidChartCreateShape, validate(missing, profileFor(.scatterChart)));
    missing.series = &.{.{ .name = "S", .values = &.{"1"}, .x_values = &.{"2"} }};
    try std.testing.expectError(error.InvalidChartCreateShape, validate(missing, profileFor(.bubbleChart)));
    missing.series = &.{.{ .name = "S", .values = &.{"1"}, .x_values = &.{"2"}, .bubble_sizes = &.{"-1"} }};
    try std.testing.expectError(error.InvalidChartNumericValue, validate(missing, profileFor(.bubbleChart)));
    try std.testing.expectError(error.InvalidChartCreateShape, validate(dataFor(.bubbleChart), profileFor(.lineChart)));
    try std.testing.expectError(error.InvalidChartCreateShape, validate(dataFor(.barChart), profileFor(.stockChart)));
    var surface = dataFor(.surfaceChart);
    surface.series = surface.series[0..1];
    try std.testing.expectError(error.InvalidChartCreateShape, validate(surface, profileFor(.surfaceChart)));
    var pie = dataFor(.pieChart);
    pie.series = &.{.{ .name = "S", .values = &.{ "-1", "2" } }};
    try std.testing.expectError(error.InvalidChartNumericValue, validate(pie, profileFor(.pieChart)));
    for ([_][]const u8{ "NaN", "1e999", "1,000", "", "=A1" }) |bad| {
        missing.series = &.{.{ .name = "S", .values = &.{"1"}, .x_values = &.{bad} }};
        try std.testing.expectError(error.InvalidChartNumericValue, validate(missing, profileFor(.scatterChart)));
    }
    var p = profileFor(.barChart);
    p.bar_direction = null;
    try std.testing.expectError(error.InvalidChartCreateProfile, profiles.validate(p));
    p = profileFor(.pieChart);
    p.grouping = .stacked;
    try std.testing.expectError(error.InvalidChartCreateProfile, profiles.validate(p));
    const bad_stock: api.Data = .{ .categories = &.{"D"}, .series = &.{
        .{ .name = "H", .values = &.{"1"}, .stock_role = .high },
        .{ .name = "L", .values = &.{"2"}, .stock_role = .low },
        .{ .name = "C", .values = &.{"3"}, .stock_role = .close },
    } };
    try std.testing.expectError(error.InvalidChartStockValues, validate(bad_stock, profileFor(.stockChart)));
    const swapped_stock: api.Data = .{ .categories = &.{"D"}, .series = &.{
        .{ .name = "L", .values = &.{"1"}, .stock_role = .low },
        .{ .name = "H", .values = &.{"2"}, .stock_role = .high },
        .{ .name = "C", .values = &.{"1.5"}, .stock_role = .close },
    } };
    try std.testing.expectError(error.InvalidChartCreateShape, validate(swapped_stock, profileFor(.stockChart)));
}

const prefix = "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":0,\"expected_text\":\"\"},\"size\":{\"width\":21600,\"height\":14400},";
const category_data = "\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[\"1\"]}]}";
fn wire(allocator: std.mem.Allocator, bytes: []const u8) !void {
    var parsed = try api.parseRequest(allocator, bytes, @splat(0));
    defer parsed.deinit();
    const xml = try @import("chart_create_xml.zig").createFor(allocator, parsed.request.data, parsed.request.chart);
    defer allocator.free(xml);
    if (parsed.request.chart) |p| try reopen(allocator, xml, p, parsed.request.data);
}
test "HWPX chart kinds strict wire explicit typed bubble and legacy allocation lifetime" {
    const bubble = prefix ++ "\"chart\":{\"kind\":\"bubbleChart\"},\"data\":{\"categories\":[],\"series\":[{\"name\":\"S\",\"values\":[\"-0\"],\"x_values\":[\"-3.0\"],\"bubble_sizes\":[\"2.5\"]}]}}";
    try wire(a, prefix ++ category_data ++ "}");
    try @import("../testing/allocation_failures.zig").check(wire, .{bubble});
}
test "HWPX chart kinds strict wire malformed names nulls unknown keys and shapes" {
    for ([_][]const u8{
        "null",                                                        "{}",                                                  "{\"kind\":\"pie\"}",                                  "{\"kind\":\"column\"}",
        "{\"kind\":\"barChart\"}",                                     "{\"kind\":\"lineChart\",\"grouping\":\"clustered\"}", "{\"kind\":\"pieChart\",\"grouping\":\"stacked\"}",    "{\"kind\":\"pieChart\",\"unknown\":0}",
        "{\"kind\":\"pieChart\",\"kind\":\"pieChart\"}",               "{\"kind\":\"pieChart\",\"wireframe\":null}",          "{\"kind\":\"surfaceChart\",\"wireframe\":\"false\"}", "{\"kind\":\"scatterChart\",\"scatter_style\":\"marker\"}",
        "{\"kind\":\"stockChart\",\"stock_layout\":\"highLowClose\"}",
    }) |bad| {
        const bytes = try std.fmt.allocPrint(a, "{s}\"chart\":{s},{s}}}", .{ prefix, bad, category_data });
        defer a.free(bytes);
        if (api.parseRequest(a, bytes, @splat(0))) |value| {
            var parsed = value;
            parsed.deinit();
            return error.ExpectedChartCreateRefusal;
        } else |err| try std.testing.expect(err != error.OutOfMemory);
    }
}

test "HWPX chart kinds strict wire refuses auxiliary coercion missing data and null arrays" {
    for ([_][]const u8{
        "\"data\":{\"categories\":[],\"series\":[{\"name\":\"S\",\"values\":[\"1\"],\"x_values\":[1]}]}",
        "\"data\":{\"categories\":[],\"series\":[{\"name\":\"S\",\"values\":[\"1\"],\"x_values\":null}]}",
        "\"data\":{\"categories\":[],\"series\":[{\"name\":\"S\",\"values\":[\"1\"],\"x_values\":[\"2\"],\"bubble_sizes\":[]}]}",
        "\"data\":{\"categories\":[],\"series\":[{\"name\":\"S\",\"values\":[\"1\"],\"x_values\":[\"2\"],\"bubble_sizes\":[\"3\"],\"stock_role\":null}]}",
        "\"data\":{\"categories\":[],\"series\":[{\"name\":\"S\",\"values\":[\"1\"],\"x_values\":[\"2\"],\"x_values\":[\"2\"],\"bubble_sizes\":[\"3\"]}]}",
    }) |bad| {
        const bytes = try std.fmt.allocPrint(a, "{s}\"chart\":{{\"kind\":\"bubbleChart\"}},{s}}}", .{ prefix, bad });
        defer a.free(bytes);
        if (api.parseRequest(a, bytes, @splat(0))) |value| {
            var parsed = value;
            parsed.deinit();
            return error.ExpectedChartCreateRefusal;
        } else |err| try std.testing.expect(err != error.OutOfMemory);
    }
}

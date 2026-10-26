const std = @import("std");
const settings = @import("chart_series_settings.zig");
const Tree = @import("chart_tree.zig");
const Plots = @import("chart_plot_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart series identity retains index order absent empty and duplicate values across series" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:stockChart><c:ser><c:idx val='4294967295'/><c:order val='1'/><x:order val='bad'/></c:ser><c:ser><c:idx val='4294967295'/><c:order val='0'/></c:ser><c:ser><c:idx/><c:order/></c:ser><c:ser/></c:stockChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree.Tree, nodes: []const Plots.Plot) !void {
            var result = try settings.collect(allocator, original, nodes, .{});
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(?u32, 4294967295), result.items[0].index.?.value);
            try std.testing.expectEqual(@as(?u32, 1), result.items[0].order.?.value);
            try std.testing.expectEqual(@as(?u32, 0), result.items[1].order.?.value);
            try std.testing.expect(result.items[2].index.?.value == null and result.items[2].order.?.value == null);
            try std.testing.expect(result.items[3].index == null and result.items[3].order == null);
        }
    }.run, .{ &tree, plots.plots });
}

test "chart series identity rejects duplicate leaves overflow negative and nested values" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:idx/><c:idx/>", error.DuplicateChartSeriesSetting },
        .{ "<c:order/><c:order/>", error.DuplicateChartSeriesSetting },
        .{ "<c:idx val='4294967296'/>", error.InvalidUnsigned32 },
        .{ "<c:order val='-1'/>", error.InvalidNonNegativeInteger },
        .{ "<c:order><c:ext/></c:order>", error.InvalidChartSeriesSetting },
    }) |case| {
        var tree = try Tree.parse(a, prefix ++ "<c:barChart><c:ser>" ++ case[0] ++ "</c:ser></c:barChart>" ++ suffix, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.expectError(case[1], settings.collect(a, &tree, plots.plots, .{}));
    }
}

test "chart series settings retain absent empty false and marker fields across allocation failures" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:lineChart><c:ser><c:marker><c:symbol val='none'/><c:size val='7'/><x:size val='invalid'/></c:marker><c:smooth val='0'/></c:ser><c:ser><c:marker><c:symbol/><c:size/></c:marker><c:smooth/></c:ser><c:ser/></c:lineChart><c:stockChart><c:ser><c:smooth val='1'/></c:ser></c:stockChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree.Tree, nodes: []const Plots.Plot) !void {
            var result = try settings.collect(allocator, original, nodes, .{});
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), result.items.len);
            try std.testing.expectEqual(settings.Symbol.none, result.items[0].marker.?.symbol.?.value.?);
            try std.testing.expectEqual(@as(u32, 7), result.items[0].marker.?.size.?.value.?);
            try std.testing.expectEqual(false, result.items[0].smooth.?.value.?);
            try std.testing.expect(result.items[1].marker.?.symbol.?.value == null);
            try std.testing.expect(result.items[1].marker.?.size.?.value == null);
            try std.testing.expect(result.items[1].smooth.?.value == null);
            try std.testing.expect(result.items[2].marker == null and result.items[2].smooth == null);
            try std.testing.expectEqual(true, result.items[3].smooth.?.value.?);
        }
    }.run, .{ &tree, plots.plots });
    try std.testing.expectError(error.LimitExceeded, settings.collect(a, &tree, plots.plots, .{ .max_series = 3 }));
    try std.testing.expectError(error.LimitExceeded, settings.collect(a, &tree, plots.plots, .{ .max_attribute_bytes = 0 }));
}

test "chart series settings reject duplicates ranges unsupported owners and nested leaves" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<c:barChart><c:ser><c:marker/></c:ser></c:barChart>", .err = error.InvalidChartSeriesSetting },
        .{ .body = "<c:radarChart><c:ser><c:smooth/></c:ser></c:radarChart>", .err = error.InvalidChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker/><c:marker/></c:ser></c:lineChart>", .err = error.DuplicateChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:smooth/><c:smooth/></c:ser></c:lineChart>", .err = error.DuplicateChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker><c:size val='1'/></c:marker></c:ser></c:lineChart>", .err = error.InvalidChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker><c:size val='73'/></c:marker></c:ser></c:lineChart>", .err = error.InvalidChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker><c:symbol val='unknown'/></c:marker></c:ser></c:lineChart>", .err = error.InvalidChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker><c:symbol val='circle'><c:ext/></c:symbol></c:marker></c:ser></c:lineChart>", .err = error.InvalidChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker><c:symbol/><c:symbol/></c:marker></c:ser></c:lineChart>", .err = error.DuplicateChartSeriesSetting },
        .{ .body = "<c:lineChart><c:ser><c:marker><c:size/><c:size/></c:marker></c:ser></c:lineChart>", .err = error.DuplicateChartSeriesSetting },
    }) |case| {
        const xml = try std.mem.concat(a, u8, &.{ prefix, case.body, suffix });
        defer a.free(xml);
        var tree = try Tree.parse(a, xml, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.expectError(case.err, settings.collect(a, &tree, plots.plots, .{}));
    }
}

test "chart series settings accept all marker symbols and both size endpoints with exact owners" {
    const a = std.testing.allocator;
    for (std.meta.tags(settings.Symbol)) |symbol| {
        const size: u32 = if (@backingInt(symbol) % 2 == 0) 2 else 72;
        const xml = try std.fmt.allocPrint(a, prefix ++ "<c:scatterChart><c:ser><c:marker><c:symbol val='{s}'/><c:size val='{d}'/></c:marker></c:ser></c:scatterChart>" ++ suffix, .{ @tagName(symbol), size });
        defer a.free(xml);
        var tree = try Tree.parse(a, xml, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        var result = try settings.collect(a, &tree, plots.plots, .{});
        defer result.deinit(a);
        try std.testing.expectEqual(symbol, result.items[0].marker.?.symbol.?.value.?);
        try std.testing.expectEqual(size, result.items[0].marker.?.size.?.value.?);
        plots.plots[0].series_nodes[0] = plots.plots[0].node;
        try std.testing.expectError(error.InvalidChartSeriesOwner, settings.collect(a, &tree, plots.plots, .{}));
    }
}

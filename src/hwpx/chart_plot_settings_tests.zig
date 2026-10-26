const std = @import("std");
const settings = @import("chart_plot_settings.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart plot settings preserve explicit absent and empty values without combo defaults" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:barChart><c:barDir val='col'/><c:grouping val='standard'/><c:varyColors val='0'/><c:axId val='0'/><c:axId val='4294967295'/><x:grouping val='ignored'/><c:ser><c:grouping val='ignored'/></c:ser></c:barChart><c:lineChart><c:grouping val='stacked'/><c:varyColors/><c:axId/></c:lineChart><c:pieChart/>" ++ suffix;
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var plots = try @import("chart_plot_values.zig").collect(a, &tree, .{});
    defer plots.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree, nodes: []const @import("chart_plot_values.zig").Plot) !void {
            var bar = try settings.read(allocator, original, nodes[0].node, .{});
            defer bar.deinit(allocator);
            var line = try settings.read(allocator, original, nodes[1].node, .{});
            defer line.deinit(allocator);
            var pie = try settings.read(allocator, original, nodes[2].node, .{});
            defer pie.deinit(allocator);
            try std.testing.expectEqual(settings.Direction.col, bar.direction.?.value.?);
            try std.testing.expectEqual(settings.Grouping.standard, bar.grouping.?.value.?);
            try std.testing.expectEqual(false, bar.vary_colors.?.value.?);
            try std.testing.expectEqual(@as(u32, 0), bar.axis_references[0].value.?);
            try std.testing.expectEqual(std.math.maxInt(u32), bar.axis_references[1].value.?);
            try std.testing.expectEqual(settings.Grouping.stacked, line.grouping.?.value.?);
            try std.testing.expect(line.direction == null);
            try std.testing.expect(line.vary_colors != null and line.vary_colors.?.value == null);
            try std.testing.expect(line.axis_references[0].value == null);
            try std.testing.expect(pie.grouping == null and pie.direction == null and pie.vary_colors == null);
            try std.testing.expectEqual(@as(usize, 0), pie.axis_references.len);
        }
    }.run, .{ &tree, plots.plots });
    try std.testing.expectError(error.LimitExceeded, settings.read(a, &tree, plots.plots[0].node, .{ .max_axis_references = 1 }));
    try std.testing.expectError(error.LimitExceeded, settings.read(a, &tree, plots.plots[0].node, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.InvalidChartPlot, settings.read(a, &tree, 0, .{}));
    try std.testing.expectError(error.InvalidChartPlot, settings.read(a, &tree, tree.elements.len, .{}));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "chart plot settings refuse invalid kind fields duplicate settings axes and nested values" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<c:lineChart><c:grouping val='clustered'/></c:lineChart>", .err = error.InvalidChartPlotSetting },
        .{ .body = "<c:pieChart><c:barDir val='bar'/></c:pieChart>", .err = error.InvalidChartPlotSetting },
        .{ .body = "<c:barChart><c:barDir val='diagonal'/></c:barChart>", .err = error.InvalidChartPlotSetting },
        .{ .body = "<c:barChart><c:grouping/><c:grouping/></c:barChart>", .err = error.DuplicateChartPlotSetting },
        .{ .body = "<c:barChart><c:varyColors val='yes'/></c:barChart>", .err = error.InvalidXmlBoolean },
        .{ .body = "<c:barChart><c:axId val='4294967296'/></c:barChart>", .err = error.InvalidUnsigned32 },
        .{ .body = "<c:barChart><c:axId val='7'/><c:axId val='7'/></c:barChart>", .err = error.DuplicateChartAxisReference },
        .{ .body = "<c:barChart><c:barDir val='col'><c:ext/></c:barDir></c:barChart>", .err = error.InvalidChartPlotSetting },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, case.body, suffix });
        defer a.free(source);
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        var plots = try @import("chart_plot_values.zig").collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.expectError(case.err, settings.read(a, &tree, plots.plots[0].node, .{}));
    }
}

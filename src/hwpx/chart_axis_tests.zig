const std = @import("std");
const model = @import("chart_axis_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart axis definitions retain IDs cross links absent values and ambiguous diagnostics" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:catAx><c:axId val='0'/><c:crossAx val='7'/><c:axPos val='b'/></c:catAx><c:valAx><c:axId val='7'/><c:crossAx val='0'/><c:axPos val='l'/><c:delete val='false'/></c:valAx><c:valAx><c:axId val='7'/></c:valAx><c:dateAx><c:axId/><c:crossAx/></c:dateAx><c:serAx/><x:catAx><c:axId val='0'/></x:catAx><c:ext><c:catAx><c:axId val='0'/></c:catAx></c:ext>" ++ suffix;
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree) !void {
            var axes = try model.collect(allocator, original, .{});
            defer axes.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 5), axes.items.len);
            const area = axes.items[0].area_node;
            try std.testing.expectEqual(model.Position.b, axes.items[0].position.?.value.?);
            try std.testing.expectEqual(@as(u32, 7), axes.items[0].cross_axis.?.value.?);
            try std.testing.expectEqual(false, axes.items[1].deleted.?.value.?);
            try std.testing.expect(axes.items[3].id != null and axes.items[3].id.?.value == null);
            try std.testing.expect(axes.items[4].id == null);
            const resolved = axes.resolve(area, 0);
            try std.testing.expectEqual(model.Link{ .status = .resolved, .node = axes.items[0].node }, resolved);
            try std.testing.expectEqual(model.Link{ .status = .ambiguous }, axes.resolve(area, 7));
            try std.testing.expectEqual(model.Link{ .status = .missing_definition }, axes.resolve(area, 999));
            try std.testing.expectEqual(model.Link{ .status = .missing_definition }, axes.resolve(area + 1, 0));
            try std.testing.expectEqual(model.Link{ .status = .missing_value }, axes.resolve(area, null));
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_axes = 0 }));
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "chart axis definitions refuse duplicate malformed and nested fields" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<c:axId/><c:axId/>", .err = error.DuplicateChartAxisField },
        .{ .body = "<c:axPos val='center'/>", .err = error.InvalidChartAxisField },
        .{ .body = "<c:axId val='4294967296'/>", .err = error.InvalidUnsigned32 },
        .{ .body = "<c:crossAx val='1'><c:ext/></c:crossAx>", .err = error.InvalidChartAxisField },
        .{ .body = "<c:delete val='yes'/>", .err = error.InvalidXmlBoolean },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, "<c:valAx>", case.body, "</c:valAx>", suffix });
        defer a.free(source);
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.err, model.collect(a, &tree, .{}));
    }
}

test "chart axis links preserve each missing ambiguous and exact plot reference under failures" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:barChart><c:axId val='0'/><c:axId val='7'/><c:axId val='999'/><c:axId/></c:barChart><c:catAx><c:axId val='0'/></c:catAx><c:valAx><c:axId val='7'/></c:valAx><c:valAx><c:axId val='7'/></c:valAx>" ++ suffix;
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var plots = try @import("chart_plot_values.zig").collect(a, &tree, .{});
    defer plots.deinit(a);
    var configuration = try @import("chart_plot_settings.zig").read(a, &tree, plots.plots[0].node, .{});
    defer configuration.deinit(a);
    var axes = try model.collect(a, &tree, .{});
    defer axes.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, plot: []const @import("chart_plot_values.zig").Plot, settings: []const @import("chart_plot_settings.zig").Settings, definitions: *const model.Values) !void {
            const links = try @import("chart_axis_links.zig").collect(allocator, plot, settings, definitions, 4);
            defer allocator.free(links);
            try std.testing.expectEqual(@as(usize, 4), links.len);
            try std.testing.expectEqualDeep(model.Link{ .status = .resolved, .node = definitions.items[0].node }, links[0].target);
            try std.testing.expectEqualDeep(model.Link{ .status = .ambiguous }, links[1].target);
            try std.testing.expectEqualDeep(model.Link{ .status = .missing_definition }, links[2].target);
            try std.testing.expectEqualDeep(model.Link{ .status = .missing_value }, links[3].target);
        }
    }.run, .{ plots.plots, @as([]const @import("chart_plot_settings.zig").Settings, &.{configuration}), &axes });
    try std.testing.expectError(error.LimitExceeded, @import("chart_axis_links.zig").collect(a, plots.plots, &.{configuration}, &axes, 3));
    try std.testing.expectError(error.InvalidChartPlotSettings, @import("chart_axis_links.zig").collect(a, plots.plots, &.{}, &axes, 4));
}

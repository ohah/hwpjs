const std = @import("std");
const Tree = @import("chart_tree.zig");
const Plots = @import("chart_plot_values.zig");
const settings = @import("chart_series_settings.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:x='urn:foreign'><c:chart><c:plotArea><c:stockChart>";
const suffix = "</c:stockChart></c:plotArea></c:chart></c:chartSpace>";

test "chart series stroke preserves missing empty noFill and foreign nested leaves with allocation failures" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:ser/><c:ser><c:spPr/></c:ser><c:ser><c:spPr><a:ln/></c:spPr></c:ser><c:ser><c:spPr><a:ln><a:noFill/></a:ln></c:spPr></c:ser><c:ser><c:spPr><a:ln><x:noFill/><x:ext><a:noFill/></x:ext></a:ln></c:spPr></c:ser>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree.Tree, nodes: []const Plots.Plot) !void {
            var value = try settings.collect(allocator, source, nodes, .{});
            defer value.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 5), value.items.len);
            try std.testing.expect(value.items[0].stroke == null and value.items[1].stroke == null);
            try std.testing.expect(value.items[2].stroke.?.no_fill_node == null);
            const stroke = value.items[3].stroke.?;
            try std.testing.expect(stroke.no_fill_node.? > stroke.node);
            try std.testing.expect(source.elements[stroke.node].is("http://schemas.openxmlformats.org/drawingml/2006/main", "ln"));
            try std.testing.expect(value.items[4].stroke.?.no_fill_node == null);
        }
    }.run, .{ &tree, plots.plots });
}

test "chart series stroke rejects duplicate properties lines fill choices and nested noFill" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:spPr/><c:spPr/>", error.DuplicateChartSeriesSetting },
        .{ "<c:spPr><a:ln/><a:ln/></c:spPr>", error.DuplicateChartSeriesSetting },
        .{ "<c:spPr><a:ln><a:noFill/><a:solidFill/></a:ln></c:spPr>", error.InvalidChartSeriesSetting },
        .{ "<c:spPr><a:ln><a:noFill/><a:noFill/></a:ln></c:spPr>", error.InvalidChartSeriesSetting },
        .{ "<c:spPr><a:ln><a:noFill><x:ext/></a:noFill></a:ln></c:spPr>", error.InvalidChartSeriesSetting },
    }) |case| {
        var tree = try Tree.parse(a, prefix ++ "<c:ser>" ++ case[0] ++ "</c:ser>" ++ suffix, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.expectError(case[1], settings.collect(a, &tree, plots.plots, .{}));
    }
}

const std = @import("std");
const settings = @import("chart_plot_settings.zig");
const Tree = @import("chart_tree.zig");
const Plots = @import("chart_plot_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart scatter style retains five enum values absent empty and allocator failures" {
    const a = std.testing.allocator;
    for (std.meta.tags(settings.ScatterStyle)) |style| {
        const xml = try std.fmt.allocPrint(a, prefix ++ "<c:scatterChart><c:axId val='1'/><c:scatterStyle val='{s}'/><x:scatterStyle val='ignored'/></c:scatterChart>" ++ suffix, .{@tagName(style)});
        defer a.free(xml);
        var tree = try Tree.parse(a, xml, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree.Tree, plot: usize, expected: settings.ScatterStyle) !void {
                var value = try settings.read(allocator, source, plot, .{});
                defer value.deinit(allocator);
                try std.testing.expectEqual(expected, value.scatter_style.?.value.?);
            }
        }.run, .{ &tree, plots.plots[0].node, style });
    }
    var tree = try Tree.parse(a, prefix ++ "<c:scatterChart/><c:scatterChart><c:scatterStyle/></c:scatterChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    var absent = try settings.read(a, &tree, plots.plots[0].node, .{});
    defer absent.deinit(a);
    var empty = try settings.read(a, &tree, plots.plots[1].node, .{});
    defer empty.deinit(a);
    try std.testing.expect(absent.scatter_style == null);
    try std.testing.expect(empty.scatter_style != null and empty.scatter_style.?.value == null);
}

test "chart scatter style rejects wrong owner duplicate unknown and nested values" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<c:lineChart><c:scatterStyle val='line'/></c:lineChart>", .err = error.InvalidChartPlotSetting },
        .{ .body = "<c:scatterChart><c:scatterStyle/><c:scatterStyle/></c:scatterChart>", .err = error.DuplicateChartPlotSetting },
        .{ .body = "<c:scatterChart><c:scatterStyle val='__unknown_scatter_style__'/></c:scatterChart>", .err = error.InvalidChartPlotSetting },
        .{ .body = "<c:scatterChart><c:scatterStyle val='line'><c:ext/></c:scatterStyle></c:scatterChart>", .err = error.InvalidChartPlotSetting },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, case.body, suffix });
        defer a.free(source);
        var tree = try Tree.parse(a, source, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        const result = settings.read(a, &tree, plots.plots[0].node, .{});
        defer {
            if (result) |value| {
                var unexpected = value;
                unexpected.deinit(a);
            } else |_| {}
        }
        try std.testing.expectError(case.err, result);
    }
}

// Explicit counterpart of the previously misclassified valid scalar.
test "chart scatter style none is a supported owned value" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:scatterChart><c:scatterStyle val='none'/></c:scatterChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    var value = try settings.read(a, &tree, plots.plots[0].node, .{});
    defer value.deinit(a);
    try std.testing.expectEqual(settings.ScatterStyle.none, value.scatter_style.?.value.?);
}

test "chart scatter style unknown scalar is refused directly without owner ambiguity" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:scatterChart><c:scatterStyle val='__unknown_scatter_style__'/></c:scatterChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    const node = tree.elements[plots.plots[0].node].first_child.?;
    try std.testing.expect(tree.elements[node].is("http://schemas.openxmlformats.org/drawingml/2006/chart", "scatterStyle"));
    try std.testing.expectEqual(@as(?settings.ScatterStyle, null), std.meta.stringToEnum(settings.ScatterStyle, "__unknown_scatter_style__"));
    const result = @import("chart_scalar_field.zig").read(settings.ScatterStyle, a, &tree, node, 4096, error.InvalidChartPlotSetting);
    defer {
        if (result) |value| {
            // Current Field(ScatterStyle) is borrowed/POD and has no deinit.
            // If an owning result is introduced, preserve the failure diagnostic
            // before releasing the unexpected successful value.
            if (comptime @hasDecl(@TypeOf(value), "deinit")) {
                var unexpected = value;
                unexpected.deinit(a);
            }
        } else |_| {}
    }
    try std.testing.expectError(error.InvalidChartPlotSetting, result);
}

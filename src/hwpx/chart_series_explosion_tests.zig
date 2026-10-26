const std = @import("std");
const settings = @import("chart_series_settings.zig");
const Tree = @import("chart_tree.zig");
const Plots = @import("chart_plot_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart series explosion retains absence empty zero and unsigned boundary across allocation failures" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:pieChart><c:ser/><c:ser><c:explosion/></c:ser><c:ser><c:explosion val='&#48;'/><x:explosion val='bad'/></c:ser></c:pieChart><c:pie3DChart><c:ser><c:explosion val='25'/></c:ser></c:pie3DChart><c:ofPieChart><c:ser><c:explosion val='4294967295'/></c:ser></c:ofPieChart><c:doughnutChart><c:ser><c:explosion val='+1'/></c:ser></c:doughnutChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree.Tree, nodes: []const Plots.Plot) !void {
            var value = try settings.collect(allocator, source, nodes, .{});
            defer value.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 6), value.items.len);
            try std.testing.expect(value.items[0].explosion == null);
            try std.testing.expect(value.items[1].explosion.?.value == null);
            try std.testing.expectEqual(@as(?u32, 0), value.items[2].explosion.?.value);
            try std.testing.expectEqual(@as(?u32, 25), value.items[3].explosion.?.value);
            try std.testing.expectEqual(@as(?u32, std.math.maxInt(u32)), value.items[4].explosion.?.value);
            try std.testing.expectEqual(@as(?u32, 1), value.items[5].explosion.?.value);
        }
    }.run, .{ &tree, plots.plots });
    try std.testing.expectError(error.LimitExceeded, settings.collect(a, &tree, plots.plots, .{ .max_attribute_bytes = 1 }));
}

test "chart series explosion rejects duplicate nested wrong kind and overflowing values" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:pieChart><c:ser><c:explosion/><c:explosion/></c:ser></c:pieChart>", error.DuplicateChartSeriesSetting },
        .{ "<c:pieChart><c:ser><c:explosion><c:ext/></c:explosion></c:ser></c:pieChart>", error.InvalidChartSeriesSetting },
        .{ "<c:lineChart><c:ser><c:explosion val='0'/></c:ser></c:lineChart>", error.InvalidChartSeriesSetting },
        .{ "<c:pieChart><c:ser><c:explosion val='-1'/></c:ser></c:pieChart>", error.InvalidNonNegativeInteger },
        .{ "<c:pieChart><c:ser><c:explosion val='4294967296'/></c:ser></c:pieChart>", error.InvalidUnsigned32 },
    }) |case| {
        var tree = try Tree.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.expectError(case[1], settings.collect(a, &tree, plots.plots, .{}));
    }
}

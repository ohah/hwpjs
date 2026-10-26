const std = @import("std");
const settings = @import("chart_plot_settings.zig");
const Tree = @import("chart_tree.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart of pie settings preserve enums boundaries empty and nonfinite without defaults" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:ofPieChart><c:ofPieType val='bar'/><c:secondPieSize val='5'/><c:splitType val='percent'/><c:splitPos val='2.5'/><c:custSplit><c:secondPiePt val='3'/></c:custSplit></c:ofPieChart><c:ofPieChart><c:ofPieType/><c:secondPieSize/><c:splitType/><c:splitPos/></c:ofPieChart><c:ofPieChart><c:secondPieSize val='200'/><c:splitPos val='INF'/><x:splitType val='bad'/></c:ofPieChart><c:ofPieChart><c:splitType val='auto'/></c:ofPieChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree.Tree) !void {
            var count: usize = 0;
            for (source.elements, 0..) |element, node| {
                if (!element.is(@import("chart_namespace.zig").uri, "ofPieChart")) continue;
                var value = try settings.read(allocator, source, node, .{});
                defer value.deinit(allocator);
                switch (count) {
                    0 => {
                        try std.testing.expectEqual(settings.OfPieType.bar, value.of_pie_type.?.value.?);
                        try std.testing.expectEqual(@as(?u32, 5), value.second_pie_size.?.value);
                        try std.testing.expectEqual(settings.SplitType.percent, value.split_type.?.value.?);
                        try std.testing.expectEqual(@as(f64, 2.5), value.split_position.?.value.?.finite);
                        try std.testing.expect(value.custom_split_node != null);
                    },
                    1 => try std.testing.expect(value.of_pie_type.?.value == null and value.second_pie_size.?.value == null and value.split_type.?.value == null and value.split_position.?.value == null),
                    2 => {
                        try std.testing.expect(value.of_pie_type == null and value.split_type == null and value.custom_split_node == null);
                        try std.testing.expectEqual(@as(?u32, 200), value.second_pie_size.?.value);
                        try std.testing.expectEqual(.positive_infinity, std.meta.activeTag(value.split_position.?.value.?));
                    },
                    3 => try std.testing.expectEqual(settings.SplitType.auto, value.split_type.?.value.?),
                    else => unreachable,
                }
                count += 1;
            }
            try std.testing.expectEqual(@as(usize, 4), count);
        }
    }.run, .{&tree});
}

test "chart of pie settings reject duplicates unknown enum range wrong kind and nested leaves" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:ofPieChart><c:ofPieType/><c:ofPieType/></c:ofPieChart>", error.DuplicateChartPlotSetting },
        .{ "<c:ofPieChart><c:splitType/><c:splitType/></c:ofPieChart>", error.DuplicateChartPlotSetting },
        .{ "<c:ofPieChart><c:splitPos/><c:splitPos/></c:ofPieChart>", error.DuplicateChartPlotSetting },
        .{ "<c:ofPieChart><c:custSplit/><c:custSplit/></c:ofPieChart>", error.DuplicateChartPlotSetting },
        .{ "<c:ofPieChart><c:secondPieSize val='4'/></c:ofPieChart>", error.InvalidChartPlotSetting },
        .{ "<c:ofPieChart><c:secondPieSize val='201'/></c:ofPieChart>", error.InvalidChartPlotSetting },
        .{ "<c:ofPieChart><c:splitType val='unknown'/></c:ofPieChart>", error.InvalidChartPlotSetting },
        .{ "<c:ofPieChart><c:ofPieType val='unknown'/></c:ofPieChart>", error.InvalidChartPlotSetting },
        .{ "<c:pieChart><c:splitType val='pos'/></c:pieChart>", error.InvalidChartPlotSetting },
        .{ "<c:ofPieChart><c:splitPos><c:ext/></c:splitPos></c:ofPieChart>", error.InvalidChartPlotSetting },
    }) |case| {
        var tree = try Tree.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], settings.read(a, &tree, 3, .{}));
    }
}

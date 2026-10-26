const std = @import("std");
const settings = @import("chart_plot_settings.zig");
const Tree = @import("chart_tree.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart circular angle retains absent empty zero and full turn with allocation failures" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:pieChart/><c:pieChart><c:firstSliceAng/></c:pieChart><c:pieChart><c:firstSliceAng val='&#48;'/></c:pieChart><c:doughnutChart><c:firstSliceAng val='+360'/><x:firstSliceAng val='invalid'/></c:doughnutChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree.Tree) !void {
            var seen: usize = 0;
            for (source.elements, 0..) |element, index| {
                if (!element.is(@import("chart_namespace.zig").uri, "pieChart") and !element.is(@import("chart_namespace.zig").uri, "doughnutChart")) continue;
                var value = try settings.read(allocator, source, index, .{});
                defer value.deinit(allocator);
                switch (seen) {
                    0 => try std.testing.expect(value.first_slice_angle == null),
                    1 => try std.testing.expect(value.first_slice_angle.?.value == null),
                    2 => try std.testing.expectEqual(@as(?u32, 0), value.first_slice_angle.?.value),
                    3 => try std.testing.expectEqual(@as(?u32, 360), value.first_slice_angle.?.value),
                    else => unreachable,
                }
                seen += 1;
            }
            try std.testing.expectEqual(@as(usize, 4), seen);
        }
    }.run, .{&tree});
}

test "chart circular angle rejects duplicate invalid range wrong kind and nested leaves" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:pieChart><c:firstSliceAng/><c:firstSliceAng/></c:pieChart>", error.DuplicateChartPlotSetting },
        .{ "<c:pieChart><c:firstSliceAng val='361'/></c:pieChart>", error.InvalidChartPlotSetting },
        .{ "<c:pieChart><c:firstSliceAng val='-1'/></c:pieChart>", error.InvalidNonNegativeInteger },
        .{ "<c:pieChart><c:firstSliceAng val='1.5'/></c:pieChart>", error.InvalidNonNegativeInteger },
        .{ "<c:pieChart><c:firstSliceAng><c:ext/></c:firstSliceAng></c:pieChart>", error.InvalidChartPlotSetting },
        .{ "<c:pie3DChart><c:firstSliceAng val='0'/></c:pie3DChart>", error.InvalidChartPlotSetting },
        .{ "<c:ofPieChart><c:firstSliceAng val='0'/></c:ofPieChart>", error.InvalidChartPlotSetting },
        .{ "<c:barChart><c:firstSliceAng val='0'/></c:barChart>", error.InvalidChartPlotSetting },
    }) |case| {
        var tree = try Tree.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], settings.read(a, &tree, 3, .{}));
    }
    var tree = try Tree.parse(a, prefix ++ "<c:pieChart><c:firstSliceAng val='360'/></c:pieChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, settings.read(a, &tree, 3, .{ .max_attribute_bytes = 2 }));
}

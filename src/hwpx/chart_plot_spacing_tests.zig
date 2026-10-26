const std = @import("std");
const settings = @import("chart_plot_settings.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart plot spacing preserves absent empty zero signed and boundary values under allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("chart_tree.zig").parse(a, prefix ++ "<c:barChart><c:axId val='0'/><c:gapWidth val='&#48;'/><c:overlap val='-100'/></c:barChart><c:barChart><c:gapWidth/><c:overlap/></c:barChart><c:barChart><x:gapWidth val='500'/></c:barChart><c:barChart><c:gapWidth val='+500'/><c:overlap val='+100'/></c:barChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("chart_tree.zig").Tree) !void {
            var seen: usize = 0;
            for (source.elements, 0..) |element, index| {
                if (!element.is(@import("chart_namespace.zig").uri, "barChart")) continue;
                var value = try settings.read(allocator, source, index, .{});
                defer value.deinit(allocator);
                switch (seen) {
                    0 => {
                        try std.testing.expectEqual(@as(usize, 1), value.axis_references.len);
                        try std.testing.expectEqual(@as(?u32, 0), value.gap_width.?.value);
                        try std.testing.expectEqual(@as(?i32, -100), value.overlap.?.value);
                    },
                    1 => {
                        try std.testing.expect(value.gap_width != null);
                        try std.testing.expect(value.gap_width.?.value == null);
                        try std.testing.expect(value.overlap.?.value == null);
                    },
                    2 => {
                        try std.testing.expect(value.gap_width == null);
                        try std.testing.expect(value.overlap == null);
                    },
                    3 => {
                        try std.testing.expectEqual(@as(?u32, 500), value.gap_width.?.value);
                        try std.testing.expectEqual(@as(?i32, 100), value.overlap.?.value);
                    },
                    else => unreachable,
                }
                seen += 1;
            }
            try std.testing.expectEqual(@as(usize, 4), seen);
        }
    }.run, .{&tree});
}

test "chart plot spacing rejects duplicate range nested and wrong owner fields" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:barChart><c:gapWidth/><c:gapWidth/></c:barChart>", error.DuplicateChartPlotSetting },
        .{ "<c:barChart><c:overlap/><c:overlap/></c:barChart>", error.DuplicateChartPlotSetting },
        .{ "<c:barChart><c:gapWidth val='501'/></c:barChart>", error.InvalidChartPlotSetting },
        .{ "<c:barChart><c:gapWidth val='-1'/></c:barChart>", error.InvalidNonNegativeInteger },
        .{ "<c:barChart><c:overlap val='0.5'/></c:barChart>", error.InvalidXmlSigned32 },
        .{ "<c:barChart><c:overlap val='2147483648'/></c:barChart>", error.InvalidXmlSigned32 },
        .{ "<c:barChart><c:overlap val='-101'/></c:barChart>", error.InvalidChartPlotSetting },
        .{ "<c:barChart><c:overlap val='101'/></c:barChart>", error.InvalidChartPlotSetting },
        .{ "<c:barChart><c:gapWidth><c:v/></c:gapWidth></c:barChart>", error.InvalidChartPlotSetting },
        .{ "<c:lineChart><c:gapWidth val='150'/></c:lineChart>", error.InvalidChartPlotSetting },
        .{ "<c:bar3DChart><c:overlap val='0'/></c:bar3DChart>", error.InvalidChartPlotSetting },
    }) |case| {
        var tree = try @import("chart_tree.zig").parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], settings.read(a, &tree, 3, .{}));
    }
    var pie = try @import("chart_tree.zig").parse(a, prefix ++ "<c:ofPieChart><c:gapWidth val='100'/></c:ofPieChart>" ++ suffix, 0, .{});
    defer pie.deinit(a);
    var value = try settings.read(a, &pie, 3, .{});
    defer value.deinit(a);
    try std.testing.expectEqual(@as(?u32, 100), value.gap_width.?.value);
    try std.testing.expectError(error.LimitExceeded, settings.read(a, &pie, 3, .{ .max_attribute_bytes = 2 }));
}

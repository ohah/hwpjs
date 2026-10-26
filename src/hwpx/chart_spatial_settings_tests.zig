const std = @import("std");
const trees = @import("chart_tree.zig");
const settings = @import("chart_plot_settings.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";
test "chart spatial settings preserve absent empty zero maximum and all shapes with allocation failures" {
    const a = std.testing.allocator;
    inline for (.{ "box", "cone", "coneToMax", "cylinder", "pyramid", "pyramidToMax" }) |shape| {
        var tree = try trees.parse(a, prefix ++ "<c:bar3DChart><c:gapDepth val='500'/><c:shape val='" ++ shape ++ "'/><x:shape val='invalid'/></c:bar3DChart>" ++ suffix, 0, .{});
        defer tree.deinit(a);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const trees.Tree) !void {
                var result = try settings.read(allocator, source, 3, .{});
                defer result.deinit(allocator);
                try std.testing.expectEqual(@as(?u32, 500), result.spatial.?.gap_depth.?.value);
                try std.testing.expectEqualStrings(shape, @tagName(result.spatial.?.shape.?.value.?));
            }
        }.run, .{&tree});
    }
    inline for (.{ "", "<c:gapDepth/><c:shape/>", "<c:gapDepth val='0'/>" }, 0..) |body, index| {
        var tree = try trees.parse(a, prefix ++ "<c:bar3DChart>" ++ body ++ "</c:bar3DChart>" ++ suffix, 0, .{});
        defer tree.deinit(a);
        var result = try settings.read(a, &tree, 3, .{});
        defer result.deinit(a);
        if (index == 0) try std.testing.expect(result.spatial.?.gap_depth == null);
        if (index == 1) try std.testing.expect(result.spatial.?.gap_depth.?.value == null and result.spatial.?.shape.?.value == null);
        if (index == 2) try std.testing.expectEqual(@as(?u32, 0), result.spatial.?.gap_depth.?.value);
    }
}
test "chart spatial settings reject wrong owners duplicate unknown nested and out of range fields" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:barChart><c:gapDepth/></c:barChart>", error.InvalidChartSpatialSetting },
        .{ "<c:line3DChart><c:shape/></c:line3DChart>", error.InvalidChartSpatialSetting },
        .{ "<c:bar3DChart><c:shape val='sphere'/></c:bar3DChart>", error.InvalidChartSpatialSetting },
        .{ "<c:bar3DChart><c:gapDepth val='501'/></c:bar3DChart>", error.InvalidChartSpatialSetting },
        .{ "<c:bar3DChart><c:gapDepth/><c:gapDepth/></c:bar3DChart>", error.DuplicateChartSpatialSetting },
        .{ "<c:bar3DChart><c:shape/><c:shape/></c:bar3DChart>", error.DuplicateChartSpatialSetting },
        .{ "<c:bar3DChart><c:shape><c:ext/></c:shape></c:bar3DChart>", error.InvalidChartSpatialSetting },
    }) |case| {
        var tree = try trees.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], settings.read(a, &tree, 3, .{}));
    }
}

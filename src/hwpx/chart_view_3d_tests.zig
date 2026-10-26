const std = @import("std");
const trees = @import("chart_tree.zig");
const view = @import("chart_view_3d.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart>";
const suffix = "</c:chart></c:chartSpace>";

test "chart view3D preserves absence empty leaves limits namespaces and allocation failures" {
    const a = std.testing.allocator;
    inline for (.{ "", "<c:view3D/>", "<c:view3D><c:rotX/><c:rotY val='0'/><c:rAngAx val='false'/><x:rotX val='bad'/></c:view3D>", "<c:view3D><c:rotX val='-90'/><c:rotY val='360'/><c:hPercent val='5'/><c:depthPercent val='2000'/><c:perspective val='240'/></c:view3D>" }, 0..) |body, index| {
        var tree = try trees.parse(a, prefix ++ body ++ suffix, 0, .{});
        defer tree.deinit(a);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const trees.Tree) !void {
                const result = try view.read(allocator, source, 4096);
                switch (index) {
                    0 => try std.testing.expect(result == null),
                    1 => try std.testing.expect(result.?.rotation_x == null),
                    2 => {
                        try std.testing.expect(result.?.rotation_x.?.value == null);
                        try std.testing.expectEqual(@as(?u32, 0), result.?.rotation_y.?.value);
                        try std.testing.expectEqual(@as(?bool, false), result.?.right_angle_axes.?.value);
                        try std.testing.expect(result.?.unparsed_children);
                    },
                    3 => {
                        try std.testing.expectEqual(@as(?i32, -90), result.?.rotation_x.?.value);
                        try std.testing.expectEqual(@as(?u32, 360), result.?.rotation_y.?.value);
                        try std.testing.expectEqual(@as(?u32, 5), result.?.height_percent.?.value);
                        try std.testing.expectEqual(@as(?u32, 2000), result.?.depth_percent.?.value);
                        try std.testing.expectEqual(@as(?u32, 240), result.?.perspective.?.value);
                    },
                    else => unreachable,
                }
            }
        }.run, .{&tree});
    }
}

test "chart view3D rejects duplicates bounds nested leaves and attribute budget" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:view3D/><c:view3D/>", error.DuplicateChartView3D },
        .{ "<c:view3D><c:rotX/><c:rotX/></c:view3D>", error.DuplicateChartView3D },
        .{ "<c:view3D><c:rotX val='91'/></c:view3D>", error.InvalidChartView3D },
        .{ "<c:view3D><c:rotX val='-91'/></c:view3D>", error.InvalidChartView3D },
        .{ "<c:view3D><c:rotY val='361'/></c:view3D>", error.InvalidChartView3D },
        .{ "<c:view3D><c:hPercent val='4'/></c:view3D>", error.InvalidChartView3D },
        .{ "<c:view3D><c:depthPercent val='2001'/></c:view3D>", error.InvalidChartView3D },
        .{ "<c:view3D><c:perspective val='241'/></c:view3D>", error.InvalidChartView3D },
        .{ "<c:view3D><c:rotX><c:ext/></c:rotX></c:view3D>", error.InvalidChartView3D },
    }) |case| {
        var tree = try trees.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], view.read(a, &tree, 4096));
    }
    var tree = try trees.parse(a, prefix ++ "<c:view3D><c:rotX val='15'/></c:view3D>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, view.read(a, &tree, 0));
}

test "chart view3D selects only direct chart owned settings" {
    const a = std.testing.allocator;
    inline for (.{
        "<x:view3D><c:rotX val='bad'/></x:view3D>",
        "<c:plotArea><c:view3D><c:rotX val='bad'/></c:view3D></c:plotArea>",
        "<c:extLst><c:view3D><c:rotX val='bad'/></c:view3D></c:extLst>",
    }) |body| {
        var tree = try trees.parse(a, prefix ++ body ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(@as(?view.Settings, null), try view.read(a, &tree, 4096));
    }
    var duplicate = try trees.parse(a, prefix ++ "</c:chart><c:chart>" ++ suffix, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.AmbiguousChartView3DOwner, view.read(a, &duplicate, 4096));
}

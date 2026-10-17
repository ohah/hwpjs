const std = @import("std");

test "chart multilevel string edit preserves equal indices in separate levels under allocation failures" {
    const a = std.testing.allocator;
    const source = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:multiLvlStrCache><c:ptCount val='2'/><c:lvl><c:pt idx='0'><c:v>first</c:v></c:pt><c:pt idx='1'><c:v>second</c:v></c:pt></c:lvl><c:lvl><c:pt idx='0'><c:v>group</c:v></c:pt><c:pt idx='1'><c:v>other</c:v></c:pt></c:lvl></c:multiLvlStrCache></c:chartSpace>";
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer points.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), points.points.len);
    try std.testing.expectEqual(points.points[0].index, points.points[2].index);
    try std.testing.expect(points.points[0].level_node.? != points.points[2].level_node.?);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree, values: *const @import("chart_point_values.zig").Values) !void {
            const output = try @import("chart_point_write.zig").write(allocator, original, values, &.{.{ .point = 2, .value = "그룹😀<&_x0008_" }}, 10000);
            defer allocator.free(output);
            var parsed = try @import("chart_tree.zig").parse(allocator, output, 0, .{});
            defer parsed.deinit(allocator);
            var current = try @import("chart_point_values.zig").collect(allocator, &parsed, .{});
            defer current.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), current.points.len);
            for ([_][]const u8{ "first", "second", "그룹😀<&_x0008_", "other" }, current.points, 0..) |expected, point, index| {
                try std.testing.expectEqualStrings(expected, point.value);
                try std.testing.expectEqual(values.points[index].index, point.index);
                try std.testing.expectEqual(values.points[index].level_node, point.level_node);
            }
            try std.testing.expectEqualStrings("group", values.points[2].value);
        }
    }.run, .{ &tree, &points });
    try std.testing.expectError(error.UnsupportedChartPointKind, @import("chart_numeric_point_write.zig").write(a, &tree, &points, &.{.{ .point = 2, .value = "2" }}, 10000));
}

test "chart string XML candidate preserves Xstring value and opaque content under allocation failures" {
    const a = std.testing.allocator;
    const source = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:strCache><c:ptCount val='1'/><c:pt idx='0'><c:v>A<!--keep--><?keep x?><![CDATA[&B]]></c:v></c:pt></c:strCache><c:numCache><c:ptCount val='1'/><c:pt idx='0'><c:v>4.30</c:v></c:pt></c:numCache></c:chartSpace>";
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer points.deinit(a);
    const value = "_x0008_\x00\r\n\t한글😀<&";
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree, values: *const @import("chart_point_values.zig").Values, replacement: []const u8) !void {
            const output = try @import("chart_point_write.zig").write(allocator, original, values, &.{ .{ .point = 0, .value = replacement }, .{ .point = 1, .value = "6.70" } }, 10000);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<!--keep--><?keep x?>") != null);
            var parsed = try @import("chart_tree.zig").parse(allocator, output, 0, .{});
            defer parsed.deinit(allocator);
            var current = try @import("chart_point_values.zig").collect(allocator, &parsed, .{});
            defer current.deinit(allocator);
            try std.testing.expectEqualStrings(replacement, current.points[0].value);
            try std.testing.expectEqualStrings("6.70", current.points[1].value);
            try std.testing.expectEqualStrings("A&B", values.points[0].value);
        }
    }.run, .{ &tree, &points, @as([]const u8, value) });
    try std.testing.expectError(error.UnsupportedChartPointKind, @import("chart_numeric_point_write.zig").write(a, &tree, &points, &.{.{ .point = 0, .value = "2" }}, 10000));
    try std.testing.expectError(error.InvalidUtf8, @import("chart_point_write.zig").write(a, &tree, &points, &.{.{ .point = 0, .value = "\xff" }}, 10000));
    const unchanged = try @import("chart_point_write.zig").write(a, &tree, &points, &.{.{ .point = 0, .value = "A&B" }}, 10000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings(source, unchanged);
    const empty = try @import("chart_point_write.zig").write(a, &tree, &points, &.{.{ .point = 0, .value = "" }}, 10000);
    defer a.free(empty);
    var empty_tree = try @import("chart_tree.zig").parse(a, empty, 0, .{});
    defer empty_tree.deinit(a);
    var empty_points = try @import("chart_point_values.zig").collect(a, &empty_tree, .{});
    defer empty_points.deinit(a);
    try std.testing.expectEqualStrings("", empty_points.points[0].value);
}

const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const Values = @import("chart_point_values.zig").Values;
const writer = @import("chart_numeric_point_write.zig");

test "chart numeric XML candidate preserves opaque comments and validates target under every allocation failure" {
    const a = std.testing.allocator;
    const source = "<?xml version='1.0'?><c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:numCache><c:ptCount val='1'/><c:pt idx='0'><c:v>4<!--keep--><?keep x?><![CDATA[.30]]></c:v></c:pt></c:numCache></c:chartSpace>";
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var values = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer values.deinit(a);
    const unchanged = try writer.write(a, &tree, &values, &.{.{ .point = 0, .value = "4.30" }}, 10000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings(source, unchanged);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree, points: *const Values) !void {
            const changed = try writer.write(allocator, original, points, &.{.{ .point = 0, .value = "6.70" }}, 10000);
            defer allocator.free(changed);
            try std.testing.expect(std.mem.indexOf(u8, changed, "<c:v>6.70<!--keep--><?keep x?></c:v>") != null);
            try std.testing.expectEqualStrings("4.30", points.points[0].value);
        }
    }.run, .{ &tree, &values });
    for ([_][]const u8{ "", "NaN", "Infinity", "1e999", "1_000", " 4", "<xml>", "1.2.3" }) |invalid| {
        try std.testing.expectError(error.InvalidChartNumericValue, writer.write(a, &tree, &values, &.{.{ .point = 0, .value = invalid }}, 10000));
    }
    try std.testing.expectError(error.DuplicateChartPointEdit, writer.write(a, &tree, &values, &.{ .{ .point = 0, .value = "1" }, .{ .point = 0, .value = "2" } }, 10000));
    try std.testing.expectError(error.InvalidChartPointIndex, writer.write(a, &tree, &values, &.{.{ .point = 1, .value = "1" }}, 10000));
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &tree, &values, &.{.{ .point = 0, .value = "1" }}, 1));
    try std.testing.expectEqualStrings(source, tree.source);
}

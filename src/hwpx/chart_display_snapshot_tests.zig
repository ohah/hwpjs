const std = @import("std");
const display = @import("chart_display_snapshot.zig");
const chart = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main'><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>title</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:tx><c:v>name</c:v></c:tx><c:cat><c:strLit><c:ptCount val='2'/><c:pt idx='1'><c:v>B</c:v></c:pt><c:pt idx='0'><c:v>A</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:ptCount val='2'/><c:pt idx='0'><c:v>1</c:v></c:pt><c:pt idx='1'><c:v>2</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>";

test "chart display snapshot retains reordered indices roles current texts and alias ownership" {
    const a = std.testing.allocator;
    const input = try @import("test_chart_series_fixture.zig").makeWithChart(a, chart, false);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
    defer a.free(nodes);
    var original = try display.read(a, &session, 0, nodes[0]);
    defer original.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), original.plots.plots.len);
    try std.testing.expectEqual(@import("chart_plot_values.zig").Kind.barChart, original.plots.plots[0].kind);
    try std.testing.expectEqual(@as(usize, 4), original.points.points.len);
    for (original.points.points, [_]u32{ 1, 0, 0, 1 }) |point, index| try std.testing.expectEqual(index, point.index);
    for (original.bindings[0..2]) |binding| try std.testing.expectEqual(@import("chart_point_roles.zig").Role.category, binding.role);
    for (original.bindings[2..4]) |binding| try std.testing.expectEqual(@import("chart_point_roles.zig").Role.value, binding.role);
    for (original.bindings) |binding| {
        try std.testing.expectEqual(original.plots.plots[0].series_nodes[0], binding.series_node.?);
        try std.testing.expectEqual(original.plots.plots[0].node, binding.plot_node.?);
    }
    try std.testing.expect(try session.setChartPoint(0, nodes[0], 2, "314.159"));
    try std.testing.expect(try session.setChartSeriesText(0, nodes[0], 0, "current name"));
    try std.testing.expect(try session.setChartRichText(0, nodes[0], 0, "current title"));
    const saved = try session.save();
    defer a.free(saved);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, current: *@import("editor_session.zig").Session, wrapper: usize) !void {
            var snapshot = try display.read(allocator, current, 0, wrapper);
            defer snapshot.deinit(allocator);
            try std.testing.expectEqualStrings("314.159", snapshot.points.points[2].value);
            try std.testing.expectEqualStrings("current name", snapshot.series_text.items[0].text);
            try std.testing.expectEqualStrings("current title", snapshot.rich_text.items[0].text);
            snapshot.points.points[2].value[0] = '9';
            snapshot.series_text.items[0].text[0] = 'X';
            snapshot.rich_text.items[0].text[0] = 'X';
        }
    }.run, .{ &session, nodes[1] });
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    var after = try display.read(a, &reopened, 0, nodes[1]);
    defer after.deinit(a);
    try std.testing.expectEqualStrings("314.159", after.points.points[2].value);
    try std.testing.expectEqualStrings("current name", after.series_text.items[0].text);
    try std.testing.expectEqualStrings("current title", after.rich_text.items[0].text);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    try std.testing.expectEqualSlices(u8, input, session.source);
    const json = try @import("chart_display_wire.zig").encode(a, &after, 1_000_000);
    defer a.free(json);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, json, .{});
    defer parsed.deinit();
    try std.testing.expectEqualStrings("chart_display", parsed.value.object.get("kind").?.string);
    try std.testing.expectEqualStrings("314.159", parsed.value.object.get("points").?.array.items[2].object.get("value").?.string);
    try std.testing.expectEqualStrings("current name", parsed.value.object.get("series_text").?.array.items[0].object.get("text").?.string);
    try std.testing.expectEqualStrings("current title", parsed.value.object.get("rich_text").?.array.items[0].object.get("text").?.string);
    try std.testing.expect(!parsed.value.object.contains("source_sha256"));
    try std.testing.expectError(error.LimitExceeded, @import("chart_display_wire.zig").encode(a, &after, json.len - 1));
}

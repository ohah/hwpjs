const std = @import("std");
const settings = @import("chart_point_settings.zig");
const Tree = @import("chart_tree.zig");
const Plots = @import("chart_plot_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea><c:pieChart><c:ser>";
const suffix = "</c:ser></c:pieChart></c:plotArea></c:chart></c:chartSpace>";

test "chart point settings preserve sparse source identity absent empty and zero with allocation failures" {
    const a = std.testing.allocator;
    var tree = try Tree.parse(a, prefix ++ "<c:dPt/><c:dPt><c:idx/><c:explosion/></c:dPt><c:dPt><c:idx val='7'/><c:explosion val='0'/><x:explosion val='bad'/><c:spPr/></c:dPt><x:dPt><c:idx val='1'/></x:dPt>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var plots = try Plots.collect(a, &tree, .{});
    defer plots.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree.Tree, nodes: []const Plots.Plot) !void {
            var value = try settings.collect(allocator, source, nodes, .{});
            defer value.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), value.items.len);
            try std.testing.expect(value.items[0].index == null and value.items[0].explosion == null);
            try std.testing.expect(value.items[1].index.?.value == null and value.items[1].explosion.?.value == null);
            try std.testing.expectEqual(@as(?u32, 7), value.items[2].index.?.value);
            try std.testing.expectEqual(@as(?u32, 0), value.items[2].explosion.?.value);
            try std.testing.expect(value.items[2].unparsed_children);
            try std.testing.expectEqual(nodes[0].series_nodes[0], value.items[2].series_node);
        }
    }.run, .{ &tree, plots.plots });
    try std.testing.expectError(error.LimitExceeded, settings.collect(a, &tree, plots.plots, .{ .max_points = 2 }));
    try std.testing.expectError(error.LimitExceeded, settings.collect(a, &tree, plots.plots, .{ .max_attribute_bytes = 0 }));
    plots.plots[0].series_nodes[0] = plots.plots[0].node;
    try std.testing.expectError(error.InvalidChartSeriesOwner, settings.collect(a, &tree, plots.plots, .{}));
}

test "chart point settings reject duplicate nested invalid and overflowing leaves" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:dPt><c:idx/><c:idx/></c:dPt>", error.DuplicateChartPointSetting },
        .{ "<c:dPt><c:explosion/><c:explosion/></c:dPt>", error.DuplicateChartPointSetting },
        .{ "<c:dPt><c:idx><c:v/></c:idx></c:dPt>", error.InvalidChartPointSetting },
        .{ "<c:dPt><c:explosion val='-1'/></c:dPt>", error.InvalidNonNegativeInteger },
        .{ "<c:dPt><c:explosion val='4294967296'/></c:dPt>", error.InvalidUnsigned32 },
    }) |case| {
        var tree = try Tree.parse(a, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(a);
        var plots = try Plots.collect(a, &tree, .{});
        defer plots.deinit(a);
        try std.testing.expectError(case[1], settings.collect(a, &tree, plots.plots, .{}));
    }
}

test "chart point settings survive Session numeric editing save reopen and detached wire" {
    const a = std.testing.allocator;
    const chart = prefix ++ "<c:dPt><c:idx val='7'/><c:explosion val='0'/></c:dPt><c:val><c:numLit><c:ptCount val='8'/><c:pt idx='0'><c:v>0</c:v></c:pt><c:pt idx='1'><c:v>0</c:v></c:pt><c:pt idx='2'><c:v>0</c:v></c:pt><c:pt idx='3'><c:v>0</c:v></c:pt><c:pt idx='4'><c:v>0</c:v></c:pt><c:pt idx='5'><c:v>0</c:v></c:pt><c:pt idx='6'><c:v>0</c:v></c:pt><c:pt idx='7'><c:v>3</c:v></c:pt></c:numLit></c:val>" ++ suffix;
    const input = try @import("test_chart_series_fixture.zig").makeWithChart(a, chart, false);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
    defer a.free(nodes);
    try std.testing.expect(try session.setChartPoint(0, nodes[0], 7, "314.159"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    var snapshot = try @import("chart_display_snapshot.zig").read(a, &reopened, 0, nodes[0]);
    defer snapshot.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), snapshot.point_settings.items.len);
    try std.testing.expectEqual(@as(?u32, 7), snapshot.point_settings.items[0].index.?.value);
    try std.testing.expectEqual(@as(?u32, 0), snapshot.point_settings.items[0].explosion.?.value);
    try std.testing.expectEqualStrings("314.159", snapshot.points.points[7].value);
    const wire = try @import("chart_display_wire.zig").encode(a, &snapshot, 100_000);
    defer a.free(wire);
    var json = try std.json.parseFromSlice(std.json.Value, a, wire, .{});
    defer json.deinit();
    try std.testing.expectEqual(@as(i64, 7), json.value.object.get("point_settings").?.array.items[0].object.get("index").?.object.get("value").?.integer);
    snapshot.point_settings.items[0].index.?.value = 999;
    const unchanged = try reopened.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
}

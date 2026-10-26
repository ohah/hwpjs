const std = @import("std");
const t = std.testing;
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const snapshots = @import("chart_current_snapshot.zig");
const Edit = @import("chart_point_write.zig").Edit;
const chart = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:ser><c:val><c:numLit><c:ptCount val='2'/><c:pt idx='0'><c:v>2</c:v></c:pt><c:pt idx='1'><c:v>3</c:v></c:pt></c:numLit></c:val><c:cat><c:strLit><c:ptCount val='1'/><c:pt idx='0'><c:v>old</c:v></c:pt></c:strLit></c:cat></c:ser></c:chartSpace>";
const edits: []const Edit = &.{ .{ .point = 0, .value = "314.159" }, .{ .point = 1, .value = "-2.50" }, .{ .point = 2, .value = "묶음😀<&_x0008_\x00\r\n" } };
fn command(node: usize) histories.Command {
    return .{ .kind = .chart_points, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .chart_node = node, .chart_points = edits };
}
test "chart point batch commits once preserves shared aliases and refuses partial changes with redo intact" {
    const a = t.allocator;
    const input = try @import("test_chart_series_fixture.zig").makeWithChart(a, chart, false);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const nodes = try snapshots.nodes(a, &session, 0);
    defer a.free(nodes);
    var history = try histories.History.init(&session, 4, 1_000_000);
    defer history.deinit();
    try t.expect(try history.apply(&session, command(nodes[0])));
    try t.expectEqual(@as(u32, 1), history.stack.revision);
    try t.expectEqual(@as(usize, 2), history.stack.revisionCount());
    try t.expect(!try history.apply(&session, command(nodes[0])));
    try t.expectEqual(@as(u32, 1), history.stack.revision);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    for (nodes) |node| {
        var current = try snapshots.read(a, &reopened, 0, node);
        defer current.deinit(a);
        for (edits) |edit| try t.expectEqualStrings(edit.value, current.values.points[edit.point].value);
    }
    try t.expect(try history.undo(&session));
    for ([_][]const Edit{
        &.{ edits[0], .{ .point = 1, .value = "NaN" } },
        &.{ edits[0], .{ .point = 99, .value = "1" } },
        &.{ edits[0], edits[0] },
        &.{ edits[0], .{ .point = 2, .value = "\xff" } },
    }, [_]anyerror{ error.InvalidChartNumericValue, error.InvalidChartPointIndex, error.DuplicateChartPointEdit, error.InvalidUtf8 }) |bad_edits, expected| {
        var invalid = command(nodes[0]);
        invalid.chart_points = bad_edits;
        try t.expectError(expected, history.apply(&session, invalid));
        try t.expectEqual(@as(u32, 0), history.stack.revision);
        try t.expectEqual(@as(u32, 2), history.stack.next_revision);
        const unchanged = try session.save();
        defer a.free(unchanged);
        try t.expectEqualSlices(u8, input, unchanged);
    }
    var empty = command(nodes[0]);
    empty.chart_points = &.{};
    try t.expect(!try history.apply(&session, empty));
    try t.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try t.expectEqualSlices(u8, input, session.source);
}

fn allocationCase(a: std.mem.Allocator, input: []const u8, seeded: bool, calls: *usize) !void {
    calls.* += 1;
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const nodes = try snapshots.nodes(a, &session, 0);
    defer a.free(nodes);
    var history = try histories.History.init(&session, 4, 1_000_000);
    defer history.deinit();
    if (seeded) _ = try history.apply(&session, .{ .kind = .chart_point, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "6.70", .chart_node = nodes[0], .chart_point = 0 });
    _ = history.apply(&session, command(nodes[0])) catch |err| {
        try t.expectEqual(@as(usize, @intFromBool(seeded)), session.chart_resources.entries.items.len);
        if (seeded) {
            const points = session.chart_resources.entries.items[0].points.points;
            try t.expectEqualStrings("6.70", points[0].value);
            try t.expectEqualStrings("3", points[1].value);
            try t.expectEqualStrings("old", points[2].value);
        }
        try t.expectEqual(@as(u32, @intFromBool(seeded)), history.stack.revision);
        try t.expectEqual(@as(u32, 1 + @as(u32, @intFromBool(seeded))), history.stack.next_revision);
        try t.expectEqualSlices(u8, input, session.source);
        return err;
    };
    const saved = try session.save();
    defer a.free(saved);
    try t.expect(try history.undo(&session));
    try t.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try t.expectEqualSlices(u8, input, session.source);
}
test "chart point batch full allocation failures preserve fresh and previously edited owners" {
    const input = try @import("test_chart_series_fixture.zig").makeWithChart(t.allocator, chart, false);
    defer t.allocator.free(input);
    for ([_]bool{ false, true }) |seeded| {
        var calls: usize = 0;
        try @import("../testing/allocation_failures.zig").check(allocationCase, .{ @as([]const u8, input), seeded, &calls });
        std.debug.print("chart point batch full allocation callbacks including success: {d}; seeded={any}\n", .{ calls, seeded });
    }
}

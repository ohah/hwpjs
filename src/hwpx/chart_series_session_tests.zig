const std = @import("std");
const names = @import("chart_series_text_session.zig");

test "series string Session preserves point edits two-copy save and checkpoint exchange" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6037/2차원원형-계열추가.hwpx", a, .limited(4_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{ .allow_observed_chart_ole_deviations = true });
    defer session.deinit();
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
    defer a.free(nodes);
    try std.testing.expectEqual(@as(usize, 1), nodes.len);
    const wrapper = nodes[0];
    var original = try names.read(a, &session, 0, wrapper);
    defer original.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), original.items.len);
    try std.testing.expectEqualStrings("계열 2", original.items[0].text);
    var points = try @import("chart_current_snapshot.zig").read(a, &session, 0, wrapper);
    defer points.deinit(a);
    var numeric: ?usize = null;
    for (points.values.points, 0..) |point, ordinal| if (point.kind == .numeric_cache) {
        numeric = ordinal;
        break;
    };
    const point = numeric orelse return error.MissingNumericPoint;
    var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 8_000_000);
    defer checkpoint.deinit();
    try std.testing.expect(try names.set(&session, 0, wrapper, 0, "계열😀<&"));
    try std.testing.expect(try session.setChartPoint(0, wrapper, point, "314.159"));
    var current = try names.read(a, &session, 0, wrapper);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("계열😀<&", current.items[0].text);
    try std.testing.expect(current.items[0].text.ptr != session.chart_resources.entries.items[0].series_text.?.items[0].text.ptr);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{ .allow_observed_chart_ole_deviations = true });
    defer reopened.deinit();
    // Loading a paired source checks chart XML against its embedded OLE copy.
    var after = try names.read(a, &reopened, 0, wrapper);
    defer after.deinit(a);
    try std.testing.expectEqualStrings("계열😀<&", after.items[0].text);
    var after_points = try @import("chart_current_snapshot.zig").read(a, &reopened, 0, wrapper);
    defer after_points.deinit(a);
    try std.testing.expectEqualStrings("314.159", after_points.values.points[point].value);
    try checkpoint.exchange(&session);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try checkpoint.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(!try names.set(&session, 0, wrapper, 0, "계열😀<&"));
    try std.testing.expectError(error.InvalidUtf8, names.set(&session, 0, wrapper, 0, "\xff"));
    try std.testing.expectError(error.InvalidChartSeriesTextIndex, names.set(&session, 0, wrapper, 1, "bad"));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, saved, refused);
    try std.testing.expect(try names.set(&session, 0, wrapper, 0, original.items[0].text));
    try std.testing.expect(try session.setChartPoint(0, wrapper, point, points.values.points[point].value));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    var history = try @import("editor_history.zig").History.init(&session, 4, 8_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .chart_series_text, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "이력😀", .chart_node = wrapper, .chart_text = 0 };
    try std.testing.expect(try history.apply(&session, command));
    const history_saved = try session.save();
    defer a.free(history_saved);
    try std.testing.expect(try history.undo(&session));
    var invalid = command;
    invalid.start = 1;
    try std.testing.expectError(error.InvalidChartSeriesTextCommand, history.apply(&session, invalid));
    invalid = command;
    invalid.chart_text = 1;
    try std.testing.expectError(error.InvalidChartSeriesTextIndex, history.apply(&session, invalid));
    invalid = command;
    invalid.inserted = original.items[0].text;
    try std.testing.expect(!try history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const history_redone = try session.save();
    defer a.free(history_redone);
    try std.testing.expectEqualSlices(u8, history_saved, history_redone);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

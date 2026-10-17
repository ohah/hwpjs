const std = @import("std");
test "chart string Session History preserves literal escapes and both saved representations" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
    defer a.free(nodes);
    var before = try @import("chart_current_snapshot.zig").read(a, &session, 0, nodes[0]);
    defer before.deinit(a);
    var ordinal: ?usize = null;
    for (before.values.points, 0..) |point, index| if (point.kind == .string_cache) {
        ordinal = index;
        break;
    };
    try std.testing.expect(ordinal != null);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const replacement = "제목😀<&_x0008_\x00\r\n\t";
    const command: @import("editor_history.zig").Command = .{ .kind = .chart_point, .paragraph = 0, .start = 0, .deleted = 0, .chart_node = nodes[0], .chart_point = ordinal.?, .inserted = replacement };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    var current = try @import("chart_current_snapshot.zig").read(a, &reopened, 0, nodes[0]);
    defer current.deinit(a);
    for (before.values.points, current.values.points, 0..) |original, point, index| try std.testing.expectEqualStrings(if (index == ordinal.?) replacement else original.value, point.value);
    var invalid = command;
    invalid.inserted = "\xff";
    try std.testing.expectError(error.InvalidUtf8, history.apply(&session, invalid));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

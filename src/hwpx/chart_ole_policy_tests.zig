const std = @import("std");
test "chart OLE policy keeps strict defaults and explicit normalized save history" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwpx", "reference/rhwp/samples/issue5652/3차원묶은세로막대형-행추가.hwpx" }, [_]anyerror{ error.InvalidFat, error.InvalidRoot }) |path, expected| {
        const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000)) catch |err| switch (err) {
            error.FileNotFound => return error.SkipZigTest,
            else => return err,
        };
        defer a.free(input);
        var strict = try @import("editor_session.zig").open(a, input, .{});
        defer strict.deinit();
        const nodes = try @import("chart_current_snapshot.zig").nodes(a, &strict, 0);
        defer a.free(nodes);
        var original = try @import("chart_current_snapshot.zig").read(a, &strict, 0, nodes[0]);
        defer original.deinit(a);
        var ordinal: ?usize = null;
        for (original.values.points, 0..) |point, index| if (point.kind == .numeric_cache or point.kind == .numeric_literal) {
            ordinal = index;
            break;
        };
        try std.testing.expectError(expected, strict.setChartNumericPoint(0, nodes[0], ordinal.?, "314.159"));
        try std.testing.expectEqual(@as(usize, 0), strict.chart_resources.entries.items.len);
        const strict_saved = try strict.save();
        defer a.free(strict_saved);
        try std.testing.expectEqualSlices(u8, input, strict_saved);
        var session = try @import("editor_session.zig").open(a, input, .{ .allow_observed_chart_ole_deviations = true });
        defer session.deinit();
        const noop = try session.save();
        defer a.free(noop);
        try std.testing.expectEqualSlices(u8, input, noop);
        var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .chart_numeric_point, .paragraph = 0, .start = 0, .deleted = 0, .chart_node = nodes[0], .chart_point = ordinal.?, .inserted = "314.159" }));
        const saved = try session.save();
        defer a.free(saved);
        var archive = try @import("../zip/archive.zig").open(a, saved, .{});
        defer archive.deinit();
        const payload = try archive.decode(archive.find(original.pair.ole_path).?, 4000000);
        defer a.free(payload);
        var valid = try @import("../ole/container.zig").open(a, payload, .observed_size_prefix, .{});
        defer valid.deinit();
        try std.testing.expectEqual(@as(u64, 0), valid.entries[0].created);
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
}

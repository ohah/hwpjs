const std = @import("std");
const editor = @import("editor_session.zig");
const names = @import("chart_series_text_session.zig");

test "series transaction shared aliases retain one owner and reject mismatched OLE atomically" {
    const a = std.testing.allocator;
    for ([_]bool{ false, true }) |mismatch| {
        const input = try @import("test_chart_series_fixture.zig").make(a, mismatch);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
        defer a.free(nodes);
        try std.testing.expectEqual(@as(usize, 2), nodes.len);
        if (mismatch) {
            try std.testing.expectError(error.ChartRepresentationMismatch, session.setChartSeriesText(0, nodes[0], 0, "changed"));
            try std.testing.expectEqual(@as(usize, 0), session.chart_resources.entries.items.len);
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
            continue;
        }
        try std.testing.expect(try session.setChartSeriesText(0, nodes[0], 0, "changed😀"));
        try std.testing.expectEqual(@as(usize, 1), session.chart_resources.entries.items.len);
        var current = try names.read(a, &session, 0, nodes[1]);
        defer current.deinit(a);
        try std.testing.expectEqualStrings("changed😀", current.items[0].text);
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (nodes) |node| {
            var after = try names.read(a, &reopened, 0, node);
            defer after.deinit(a);
            try std.testing.expectEqualStrings("changed😀", after.items[0].text);
        }
        var archive = try @import("../zip/archive.zig").open(a, saved, .{});
        defer archive.deinit();
        const xml = try archive.decode(archive.find("Chart/a.xml").?, 1000000);
        defer a.free(xml);
        for ([_][]const u8{ "BinData/a.ole", "BinData/b.ole" }) |path| {
            const payload = try archive.decode(archive.find(path).?, 1000000);
            defer a.free(payload);
            var compound = try @import("../ole/container.zig").open(a, payload, .observed_size_prefix, .{});
            defer compound.deinit();
            try std.testing.expectEqualSlices(u8, xml, compound.entries[(try compound.findExact("/OOXMLChartContents")).?].content);
            try std.testing.expectEqualStrings("opaque", compound.entries[(try compound.findExact("/Sibling")).?].content);
        }
    }
}

test "series transaction complete allocation sweep preserves atomic first publication and history" {
    const a = std.testing.allocator;
    const input = try @import("test_chart_series_fixture.zig").make(a, false);
    defer a.free(input);
    var calls: usize = 0;
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, count: *usize) !void {
            count.* += 1;
            var session = try editor.open(allocator, bytes, .{});
            defer session.deinit();
            const nodes = try @import("chart_current_snapshot.zig").nodes(allocator, &session, 0);
            defer allocator.free(nodes);
            var history = try @import("editor_history.zig").History.init(&session, 4, 1_000_000);
            defer history.deinit();
            _ = history.apply(&session, .{ .kind = .chart_series_text, .paragraph = 0, .start = 0, .deleted = 0, .chart_node = nodes[0], .chart_text = 0, .inserted = "changed😀" }) catch |err| {
                try std.testing.expectEqual(@as(usize, 0), session.chart_resources.entries.items.len);
                try std.testing.expectEqual(@as(u32, 0), history.stack.revision);
                try std.testing.expectEqual(@as(u32, 1), history.stack.next_revision);
                try std.testing.expectEqual(@as(usize, 1), history.stack.revisionCount());
                try std.testing.expectEqualSlices(u8, bytes, session.source);
                return err;
            };
            const saved = try session.save();
            defer allocator.free(saved);
            try std.testing.expect(try history.undo(&session));
            const undone = try session.save();
            defer allocator.free(undone);
            try std.testing.expectEqualSlices(u8, bytes, undone);
            try std.testing.expect(try history.redo(&session));
            const redone = try session.save();
            defer allocator.free(redone);
            try std.testing.expectEqualSlices(u8, saved, redone);
            try std.testing.expectEqualSlices(u8, bytes, session.source);
        }
    }.run, .{ @as([]const u8, input), &calls });
    std.debug.print("series transaction allocation callbacks including success: {d}\n", .{calls});
}

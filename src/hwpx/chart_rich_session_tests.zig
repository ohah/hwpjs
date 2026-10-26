const std = @import("std");
const titles = @import("chart_rich_text_session.zig");

test "chart rich text Session retains both representations numeric values and checkpoint" {
    try @import("../testing/checked_allocator.zig").run(run, .{});
}

fn run(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx", a, .limited(32_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{ .allow_observed_chart_ole_deviations = true });
    defer session.deinit();
    var edited: usize = 0;
    for (0..session.sections.len) |section| {
        const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, section);
        defer a.free(nodes);
        for (nodes) |wrapper| {
            var original = try titles.read(a, &session, section, wrapper);
            defer original.deinit(a);
            if (original.items.len == 0) continue;
            try std.testing.expectEqual(@as(usize, 1), original.items.len);
            var original_points = try @import("chart_current_snapshot.zig").read(a, &session, section, wrapper);
            defer original_points.deinit(a);
            var numeric: ?usize = null;
            for (original_points.values.points, 0..) |point, ordinal| if (point.kind == .numeric_cache or point.kind == .numeric_literal) {
                numeric = ordinal;
                break;
            };
            const point = numeric orelse return error.MissingNumericPoint;
            var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 128_000_000);
            defer checkpoint.deinit();
            try std.testing.expect(try session.setChartRichText(section, wrapper, 0, "제목😀<&_x0041_"));
            try std.testing.expect(try session.setChartPoint(section, wrapper, point, "314.159"));
            const saved = try session.save();
            defer a.free(saved);
            var current = try titles.read(a, &session, section, wrapper);
            defer current.deinit(a);
            try std.testing.expectEqualStrings("제목😀<&_x0041_", current.items[0].text);
            try std.testing.expect(current.items[0].text.ptr != session.chart_resources.entries.items[0].rich_text.?.items[0].text.ptr);
            var reopened = try @import("editor_session.zig").open(a, saved, .{ .allow_observed_chart_ole_deviations = true });
            defer reopened.deinit();
            var after = try titles.read(a, &reopened, section, wrapper);
            defer after.deinit(a);
            try std.testing.expectEqualStrings("제목😀<&_x0041_", after.items[0].text);
            var saved_points = try @import("chart_current_snapshot.zig").read(a, &reopened, section, wrapper);
            defer saved_points.deinit(a);
            try std.testing.expectEqualStrings("314.159", saved_points.values.points[point].value);
            try checkpoint.exchange(&session);
            const undo = try session.save();
            defer a.free(undo);
            try std.testing.expectEqualSlices(u8, input, undo);
            try checkpoint.exchange(&session);
            const redo = try session.save();
            defer a.free(redo);
            try std.testing.expectEqualSlices(u8, saved, redo);
            try std.testing.expect(!try session.setChartRichText(section, wrapper, 0, "제목😀<&_x0041_"));
            try std.testing.expectError(error.InvalidXmlCharacter, session.setChartRichText(section, wrapper, 0, "\x00"));
            try std.testing.expectError(error.InvalidChartRichTextIndex, session.setChartRichText(section, wrapper, 1, "bad"));
            const refused = try session.save();
            defer a.free(refused);
            try std.testing.expectEqualSlices(u8, saved, refused);
            try std.testing.expect(try session.setChartRichText(section, wrapper, 0, original.items[0].text));
            try std.testing.expect(try session.setChartPoint(section, wrapper, point, original_points.values.points[point].value));
            const restored = try session.save();
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, input, restored);
            var history = try @import("editor_history.zig").History.init(&session, 4, 128_000_000);
            defer history.deinit();
            const command: @import("editor_history.zig").Command = .{
                .kind = .chart_rich_text,
                .section = section,
                .paragraph = 0,
                .start = 0,
                .deleted = 0,
                .inserted = "이력 제목😀",
                .chart_node = wrapper,
                .chart_text = 0,
            };
            try std.testing.expect(try history.apply(&session, command));
            const history_saved = try session.save();
            defer a.free(history_saved);
            try std.testing.expect(try history.undo(&session));
            const history_undo = try session.save();
            defer a.free(history_undo);
            try std.testing.expectEqualSlices(u8, input, history_undo);
            var invalid = command;
            invalid.start = 1;
            try std.testing.expectError(error.InvalidChartRichTextCommand, history.apply(&session, invalid));
            invalid = command;
            invalid.deleted = 1;
            try std.testing.expectError(error.InvalidChartRichTextCommand, history.apply(&session, invalid));
            invalid = command;
            invalid.chart_text = 1;
            try std.testing.expectError(error.InvalidChartRichTextIndex, history.apply(&session, invalid));
            invalid = command;
            invalid.inserted = "\x00";
            try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, invalid));
            invalid.inserted = original.items[0].text;
            try std.testing.expect(!try history.apply(&session, invalid));
            try std.testing.expect(try history.redo(&session));
            const history_redo = try session.save();
            defer a.free(history_redo);
            try std.testing.expectEqualSlices(u8, history_saved, history_redo);
            try std.testing.expect(try history.undo(&session));
            edited += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 2), edited);
}

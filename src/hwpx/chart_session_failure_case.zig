const std = @import("std");

pub fn run(allocator: std.mem.Allocator, source: []const u8, before: []const u8, count: *usize, allow: bool) !void {
    count.* += 1;
    defer std.testing.expectEqualSlices(u8, before, source) catch @panic("SourceChanged");
    var session = try @import("editor_session.zig").open(allocator, source, .{ .allow_observed_chart_ole_deviations = allow });
    defer session.deinit();
    var wrapper: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |_, index| if (@import("run_switch_anchor.zig").supported(&session.sections[0].tree, index)) {
        wrapper = index;
        break;
    };
    var archive = try @import("../zip/archive.zig").open(allocator, source, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Chart/chart1.xml").?, 4000000);
    defer allocator.free(xml);
    var tree = try @import("chart_tree.zig").parse(allocator, xml, 0, .{});
    defer tree.deinit(allocator);
    var points = try @import("chart_point_values.zig").collect(allocator, &tree, .{});
    defer points.deinit(allocator);
    var ordinal: ?usize = null;
    for (points.points, 0..) |point, index| if (point.kind == .numeric_cache) {
        ordinal = index;
        break;
    };
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    _ = history.apply(&session, .{ .kind = .chart_numeric_point, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "314.159", .chart_node = wrapper.?, .chart_point = ordinal.? }) catch |err| {
        try std.testing.expectEqual(@as(usize, 0), session.chart_resources.entries.items.len);
        return err;
    };
    _ = history.apply(&session, .{ .kind = .chart_numeric_point, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "6.70", .chart_node = wrapper.?, .chart_point = ordinal.? }) catch |err| {
        try std.testing.expectEqual(@as(usize, 1), session.chart_resources.entries.items.len);
        try std.testing.expectEqualStrings("314.159", session.chart_resources.entries.items[0].points.points[ordinal.?].value);
        return err;
    };
    try std.testing.expect(try history.undo(&session));
    const saved = try session.save();
    defer allocator.free(saved);
    try std.testing.expect(!std.mem.eql(u8, source, saved));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer allocator.free(undone);
    try std.testing.expectEqualSlices(u8, source, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

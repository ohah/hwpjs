const std = @import("std");
test "chart current snapshot owns role bindings under allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
    defer a.free(nodes);
    var snapshot = try @import("chart_current_snapshot.zig").read(a, &session, 0, nodes[0]);
    defer snapshot.deinit(a);
    var numeric: ?usize = null;
    for (snapshot.values.points, 0..) |point, index| if (point.kind == .numeric_cache) {
        numeric = index;
        break;
    };
    try std.testing.expect(try session.setChartNumericPoint(0, nodes[0], numeric.?, "314.159"));
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, opened: *@import("editor_session.zig").Session, wrapper: usize, ordinal: usize) !void {
            var current = try @import("chart_current_snapshot.zig").read(allocator, opened, 0, wrapper);
            defer current.deinit(allocator);
            try std.testing.expectEqual(current.values.points.len, current.bindings.len);
            try std.testing.expectEqualStrings("314.159", current.values.points[ordinal].value);
            try std.testing.expectEqual(@import("chart_point_roles.zig").Role.value, current.bindings[ordinal].role);
            try std.testing.expect(current.values.points[ordinal].value.ptr != opened.chart_resources.entries.items[0].points.points[ordinal].value.ptr);
        }
    }.run, .{ &session, nodes[0], numeric.? });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "chart source context owns package results under allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, &session, 0);
    defer a.free(nodes);
    try std.testing.expectEqual(@as(usize, 1), nodes.len);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, opened: *const @import("editor_session.zig").Session, wrapper: usize) !void {
            var source = try @import("chart_source_context.zig").load(allocator, opened, 0, wrapper);
            defer source.deinit(allocator);
            try std.testing.expectEqualStrings("Chart/chart1.xml", source.pair.chart_path);
            try std.testing.expectEqualStrings("BinData/ole1.ole", source.pair.ole_path);
            try std.testing.expect(source.tree.source.len > 0);
            var points = try @import("chart_point_values.zig").collect(allocator, &source.tree, .{});
            defer points.deinit(allocator);
            try std.testing.expect(points.points.len > 0);
        }
    }.run, .{ @as(*const @import("editor_session.zig").Session, &session), nodes[0] });
    try std.testing.expectEqualSlices(u8, input, session.source);
    try std.testing.expectEqual(@as(usize, 0), session.chart_resources.entries.items.len);
}

const std = @import("std");
const axes = @import("chart_axis_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:chart><c:plotArea><c:valAx><c:axId val='7'/><c:scaling>";
const suffix = "</c:scaling></c:valAx></c:plotArea></c:chart></c:chartSpace>";

test "chart axis scaling preserves explicit finite values signed zero and absent defaults under failures" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:orientation val='maxMin'/><c:min val='-0'/><c:max val='1.25e3'/>" ++ suffix;
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("chart_tree.zig").Tree) !void {
            var values = try axes.collect(allocator, original, .{});
            defer values.deinit(allocator);
            const scaling = values.items[0].scaling.?;
            try std.testing.expectEqual(@import("chart_axis_scaling.zig").Orientation.maxMin, scaling.orientation.?.value.?);
            try std.testing.expectEqual(@as(f64, 1250), scaling.maximum.?.value.?.finite);
            try std.testing.expectEqual(@as(u64, 0x8000000000000000), @as(u64, @bitCast(scaling.minimum.?.value.?.finite)));
            try std.testing.expect(scaling.log_base == null);
            try std.testing.expect(scaling.displayIssue() == null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}

test "chart axis scaling keeps source numbers and distinguishes unsupported display inputs" {
    const a = std.testing.allocator;
    const Issue = @import("chart_axis_scaling.zig").DisplayIssue;
    for ([_]struct { body: []const u8, issue: ?Issue }{
        .{ .body = "", .issue = null },
        .{ .body = "<c:logBase val='2'/>", .issue = null },
        .{ .body = "<c:logBase val='1000'/>", .issue = null },
        .{ .body = "<c:logBase val='1.999'/>", .issue = .invalid_log_base },
        .{ .body = "<c:logBase val='1000.001'/>", .issue = .invalid_log_base },
        .{ .body = "<c:min val='INF'/>", .issue = .non_finite },
        .{ .body = "<c:min val='-INF'/>", .issue = .non_finite },
        .{ .body = "<c:max val='NaN'/>", .issue = .non_finite },
        .{ .body = "<c:max val='1e999'/>", .issue = .non_finite },
        .{ .body = "<c:min/>", .issue = .missing_value },
        .{ .body = "<c:orientation/>", .issue = .missing_value },
        .{ .body = "<c:min val='2'/><c:max val='2'/>", .issue = .invalid_range },
        .{ .body = "<c:min val='3'/><c:max val='2'/>", .issue = .invalid_range },
        .{ .body = "<c:logBase val='10'/><c:min val='0'/>", .issue = .non_positive_log_range },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, case.body, suffix });
        defer a.free(source);
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        var values = try axes.collect(a, &tree, .{});
        defer values.deinit(a);
        try std.testing.expectEqual(case.issue, values.items[0].scaling.?.displayIssue());
        try std.testing.expectEqualStrings(source, tree.source);
    }
}

test "chart axis scaling refuses duplicate malformed enum number and nested fields" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, err: anyerror }{
        .{ .body = "<c:min/><c:min/>", .err = error.DuplicateChartAxisScalingField },
        .{ .body = "<c:orientation val='up'/>", .err = error.InvalidChartAxisScaling },
        .{ .body = "<c:min val='1_0'/>", .err = error.InvalidXmlFloat },
        .{ .body = "<c:logBase val='2'><c:ext/></c:logBase>", .err = error.InvalidChartAxisScaling },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, case.body, suffix });
        defer a.free(source);
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.err, axes.collect(a, &tree, .{}));
    }
}

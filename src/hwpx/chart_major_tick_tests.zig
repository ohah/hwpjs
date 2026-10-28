const std = @import("std");
const model = @import("chart_axis_values.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";
fn observed(a: std.mem.Allocator) !void {
    const source = prefix ++ "<c:valAx><c:majorTickMark val='out'/></c:valAx><c:catAx><c:majorTickMark val='in'/></c:catAx><c:serAx><c:majorTickMark val='cross'/></c:serAx><c:dateAx><c:majorTickMark val='none'/></c:dateAx>" ++ suffix;
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    var axes = try model.collect(a, &tree, .{});
    defer axes.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), axes.items.len);
    for (axes.items, [_]model.TickMark{ .out, .in, .cross, .none }) |axis, expected| try std.testing.expectEqual(expected, axis.major_tick_mark.?.value.?);
    try std.testing.expectEqualStrings(source, tree.source);
}
test "chart major ticks explicit four values preserve source with allocation failures" {
    try observed(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(observed, .{});
}
test "chart major ticks retain absent and val missing and foreign namespace separately" {
    const a = std.testing.allocator;
    var tree = try @import("chart_tree.zig").parse(a, prefix ++ "<c:valAx/><c:catAx><c:majorTickMark/></c:catAx><c:serAx><x:majorTickMark val='out'/></c:serAx>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    var axes = try model.collect(a, &tree, .{});
    defer axes.deinit(a);
    try std.testing.expect(axes.items[0].major_tick_mark == null);
    try std.testing.expect(axes.items[1].major_tick_mark != null and axes.items[1].major_tick_mark.?.value == null);
    try std.testing.expect(axes.items[2].major_tick_mark == null);
}
test "chart major ticks reject invalid nested duplicate and limit without raw mutation" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:majorTickMark val='future'/>", error.InvalidChartAxisField },
        .{ "<c:majorTickMark val='out'><c:ext/></c:majorTickMark>", error.InvalidChartAxisField },
        .{ "<c:majorTickMark/><c:majorTickMark/>", error.DuplicateChartAxisField },
    }) |row| {
        const source = prefix ++ "<c:valAx>" ++ row[0] ++ "</c:valAx>" ++ suffix;
        var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(row[1], model.collect(a, &tree, .{}));
        try std.testing.expectEqualStrings(source, tree.source);
    }
}

test "chart major ticks enforce attribute budget without source mutation" {
    const a = std.testing.allocator;
    const source = prefix ++ "<c:valAx><c:majorTickMark val='out'/></c:valAx>" ++ suffix;
    var tree = try @import("chart_tree.zig").parse(a, source, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, model.collect(a, &tree, .{ .max_attribute_bytes = 2 }));
    try std.testing.expectEqualStrings(source, tree.source);
}

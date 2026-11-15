//! Exact policy boundaries, authored only; no Native run without slot grant.
const std = @import("std");
const decimal = @import("chart_create_decimal.zig");
const model = @import("chart_create_data.zig");
const api = @import("chart_create.zig");
const a = std.testing.allocator;
test "HWPX chart family decimal exact shared vectors and bounded lexical domain" {
    const Vector = struct { left: []const u8, right: []const u8, order: std.math.Order };
    const vectors = try std.json.parseFromSlice([]const Vector, a, @embedFile("chart_create_decimal_vectors.json"), .{});
    defer vectors.deinit();
    for (vectors.value) |v| try std.testing.expectEqual(v.order, try decimal.compare(v.left, v.right));
    for ([_][]const u8{ "", "-", ".", "1..2", "1e", "1e+", "1e+-2", "1e10001", "0e-10001", "1e99999999999999999999", "1 2", "NaN" }) |bad|
        try std.testing.expectError(error.InvalidChartNumericValue, decimal.parse(bad));
    try std.testing.expectEqual(false, (try decimal.parse("-0e-10000")).negative);
    try std.testing.expectEqual(true, (try decimal.parse("-1e-5000")).negative);
}
fn scalarPayload(kind: @import("chart_plot_kind.zig").Kind, value: []const u8, p: api.Profile) !void {
    const numbers = [_][]const u8{value};
    const rows = [_]model.Series{.{ .name = "S", .values = if (kind == .bubbleChart) &.{"1"} else &numbers, .x_values = if (kind == .bubbleChart) &.{"1"} else null, .bubble_sizes = if (kind == .bubbleChart) &numbers else null }};
    const data: model.Data = .{ .categories = if (kind == .bubbleChart) &.{} else &.{"A"}, .series = &rows };
    const xml = try @import("chart_create_xml.zig").createFor(a, data, p);
    defer a.free(xml);
    var tree = try @import("chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer points.deinit(a);
    try std.testing.expectEqualStrings(value, points.points[points.points.len - 1].value);
}
test "HWPX chart family decimal nonnegative underflow rejects nonzero negatives and preserves signed zero" {
    for ([_]@import("chart_plot_kind.zig").Kind{ .pieChart, .pie3DChart, .doughnutChart, .ofPieChart, .bubbleChart }) |kind| {
        const p: api.Profile = .{ .kind = kind, .of_pie_type = if (kind == .ofPieChart) .pie else null };
        for ([_][]const u8{ "-1e-5000", "-0.00000000000000000000000001e-5000", "-5e-324" }) |value|
            try std.testing.expectError(error.InvalidChartNumericValue, scalarPayload(kind, value, p));
        for ([_][]const u8{ "-0", "-0e-5000", "0", "1e-5000", "5e-324" }) |value| try scalarPayload(kind, value, p);
    }
}
fn stock(high: []const u8, low: []const u8, close: []const u8, open: ?[]const u8) !void {
    const tail: []const model.Series = &.{
        .{ .name = "H", .values = &.{high}, .stock_role = .high },
        .{ .name = "L", .values = &.{low}, .stock_role = .low },
        .{ .name = "C", .values = &.{close}, .stock_role = .close },
    };
    const opening = [_][]const u8{open orelse "0"};
    var rows: [4]model.Series = undefined;
    var series = tail;
    if (open != null) {
        rows[0] = .{ .name = "O", .values = &opening, .stock_role = .open };
        @memcpy(rows[1..], tail);
        series = &rows;
    }
    try model.validateFor(.{ .categories = &.{"D"}, .series = series }, .{ .kind = .stockChart, .stock_layout = if (open != null) .openHighLowClose else .highLowClose });
}
test "HWPX chart family decimal stock uses exact authored order beyond f64 precision and underflow" {
    try std.testing.expectError(error.InvalidChartStockValues, stock("1", "1.0000000000000001", "1", null));
    try std.testing.expectError(error.InvalidChartStockValues, stock("1", "0", "1.0000000000000001", null));
    try std.testing.expectError(error.InvalidChartStockValues, stock("1", "0", "1", "1.0000000000000001"));
    try std.testing.expectError(error.InvalidChartStockValues, stock("1e-5000", "2e-5000", "1e-5000", null));
    try stock("1.0000000000000002", "1.0000000000000000", "1.0000000000000001", "1.0000000000000001");
    try stock("3e-5000", "1e-5000", "2e-5000", null);
    try stock("-1", "-1.0000000000000002", "-1.0000000000000001", null);
    try stock("0", "-0", "-0e-5000", null);
}
test "HWPX chart family cache point exact limits XY lengths and legacy accounting remain distinct" {
    const values = try a.alloc([]const u8, 4096);
    defer a.free(values);
    @memset(values, "1");
    const rows: []const model.Series = &.{
        .{ .name = "A", .values = values }, .{ .name = "B", .values = values },
        .{ .name = "C", .values = values }, .{ .name = "D", .values = values },
    };
    const bar: api.Profile = .{ .kind = .barChart, .bar_direction = .col, .grouping = .clustered };
    try model.validateFor(.{ .categories = values, .series = rows[0..2] }, bar); // 16384 caches
    const over: []const model.Series = &.{
        .{ .name = "A", .values = values[0..2731] }, .{ .name = "B", .values = values[0..2731] }, .{ .name = "C", .values = values[0..2731] },
    };
    try std.testing.expectError(error.LimitExceeded, model.validateFor(.{ .categories = values[0..2731], .series = over }, bar)); // 16386
    try model.validate(.{ .categories = values, .series = rows }); // legacy 16384 value points
    try std.testing.expectError(error.LimitExceeded, model.validateFor(.{ .categories = values, .series = rows }, bar));
    var bubble_rows = [_]model.Series{
        .{ .name = "A", .values = values[0..2730], .x_values = values[0..2730], .bubble_sizes = values[0..2730] },
        .{ .name = "B", .values = values[0..2731], .x_values = values[0..2731], .bubble_sizes = values[0..2731] },
    };
    try model.validateFor(.{ .categories = &.{}, .series = &bubble_rows }, .{ .kind = .bubbleChart }); // 16383, varying lengths
    bubble_rows[0] = bubble_rows[1];
    try std.testing.expectError(error.LimitExceeded, model.validateFor(.{ .categories = &.{}, .series = &bubble_rows }, .{ .kind = .bubbleChart })); // 16386
}

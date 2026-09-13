const std = @import("std");
const core = @import("hwpjs");
const contents = core.hwp5.chart_observed_contents;
const t = std.testing;
const fixture = @import("chart_fixture");
const layout: contents.Layout = .{ .primary_axis_count = fixture.primary_axis_count, .line_item_count = fixture.line_item_count, .series_point_counts = &fixture.point_counts };
fn decode() ![fixture.bytes.len]u8 {
    var bytes: [fixture.bytes.len]u8 = undefined;
    @memcpy(&bytes, fixture.bytes);
    return bytes;
}
fn exercise(a: std.mem.Allocator) !void {
    var bytes = try decode();
    var value = try contents.readObservedV6(a, &bytes, layout, .{});
    defer value.deinit();
    try t.expectEqual(bytes.len, value.end);
    try t.expectEqual(fixture.point_counts.len, value.series.items.len);
    for (value.series.items, layout.series_point_counts) |item, n| try t.expectEqual(n, item.section.points.len);
    const name = value.prefix.legend.font.name.bytes;
    try t.expect(name.len > 0);
    const begin = @intFromPtr(&bytes);
    try t.expect(@intFromPtr(name.ptr) >= begin and @intFromPtr(name.ptr) + name.len <= begin + bytes.len);
    const raw = value.prefix.transition.raw;
    @memset(&bytes, 0xcc);
    try t.expectEqual(@as(u8, 0xcc), name[0]);
    try t.expectEqualSlices(u8, &raw, &value.prefix.transition.raw);
}
test "actual Contents success ownership and all allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "actual Contents normal allocator ownership" {
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try t.expectEqual(.ok, gpa.deinit());
}
fn rejected(a: std.mem.Allocator, bytes: []const u8, options: contents.Options, expected: anyerror) !void {
    var value = contents.readObservedV6(a, bytes, layout, options) catch |err| {
        try t.expectEqual(expected, err);
        return;
    };
    defer value.deinit();
    return error.ExpectedContentsRejection;
}
test "actual Contents every cut and trailing bytes release all allocations" {
    var bytes = try decode();
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    for (0..bytes.len) |cut| {
        if (cut >= 36) std.mem.writeInt(u32, bytes[32..36], @intCast(cut - 36), .little);
        try rejected(gpa.allocator(), bytes[0..cut], .{}, error.UnexpectedEnd);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
    bytes = try decode();
    var extra: [fixture.bytes.len + 1]u8 = @splat(0);
    @memcpy(extra[0..bytes.len], &bytes);
    std.mem.writeInt(u32, extra[32..36], @intCast(extra.len - 36), .little);
    try rejected(gpa.allocator(), &extra, .{}, error.UnexpectedChartTrailingBytes);
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try t.expectEqual(.ok, gpa.deinit());
}
test "actual Contents early and late quota errors release all allocations" {
    const bytes = try decode();
    const options = [_]contents.Options{
        .{ .max_axes = fixture.primary_axis_count - 1 },                               .{ .max_line_items = fixture.line_item_count - 1 },
        .{ .series = .{ .max_series = fixture.point_counts.len - 1 } },                .{ .series = .{ .series = .{ .section = .{ .max_points = fixture.point_counts[0] - 1 } } } },
        .{ .prefix = .{ .grid = .{ .prelude = .{ .types = .{ .max_types = 1 } } } } }, .{ .prefix = .{ .objects = .{ .max_objects = 1 } } },
        .{ .light = .{ .max_sources = 0 } },                                           .{ .axis = .{ .max_string_bytes = 0 } },
        .{ .title = .{ .max_string_bytes = 0 } },
    };
    for (options) |option| {
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        try rejected(gpa.allocator(), &bytes, option, error.LimitExceeded);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
        try t.expectEqual(.ok, gpa.deinit());
    }
}

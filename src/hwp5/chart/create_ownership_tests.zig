//! Detached resource ownership only. Does not claim whole-file/history gates.
const std = @import("std");
const a = std.testing.allocator;
const fixture = @import("create_test_fixture.zig");
const resources = @import("create_resources.zig");
const measure = @import("../../testing/bounded_allocation_probe.zig");

fn success(allocator: std.mem.Allocator, input: []const u8, image: []const u8) !void {
    var prepared = try resources.prepare(allocator, input, fixture.version, fixture.names, fixture.data, image, .{});
    defer prepared.deinit(allocator);
    try std.testing.expectEqualSlices(u8, image, prepared.fallback);
    try std.testing.expectEqualStrings("/BinData/BIN0004", prepared.ole_path);
}

fn lateRefusal(allocator: std.mem.Allocator, input: []const u8, image: []const u8) !void {
    if (resources.prepare(allocator, input, fixture.version, fixture.names, fixture.data, image, .{ .max_result_bytes = 1 })) |value| {
        var unexpected = value;
        defer unexpected.deinit(allocator);
        return error.TestExpectedError;
    } else |err| {
        if (err != error.LimitExceeded) return err; // OOM must propagate to the harness.
    }
}

fn sweep(comptime callback: anytype) !void {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    const image = try a.dupe(u8, fixture.fallback);
    defer a.free(image);
    // Each measure call creates/deinitializes a fresh checked allocator and
    // asserts total_requested_bytes=0 and allocated_bytes==freed_bytes for that
    // individual trial. These checks are stronger than one sweep-final deinit.
    const baseline = try measure.measureFallback(callback, .{ input, image }, null);
    try std.testing.expect(baseline.allocations > 0);
    var trials: usize = 0;
    for (0..baseline.allocations) |index| {
        const result = try measure.measureFallback(callback, .{ input, image }, index);
        try std.testing.expectEqual(result.allocated_bytes, result.freed_bytes);
        try std.testing.expectEqualSlices(u8, before, input);
        try std.testing.expectEqualSlices(u8, fixture.fallback, image);
        trials += 1;
    }
    try std.testing.expectEqual(baseline.allocations, trials);
    try std.testing.expectError(error.FailureIndexNotReached, measure.measureFallback(callback, .{ input, image }, baseline.allocations));
    std.debug.print("H5_CHART_OWNERSHIP declared_failures={d} completed_trials={d} per_trial_live_zero=true no_resize=true\n", .{ baseline.allocations, trials });
}

test "H5 chart create ownership successful preparation has per trial no resize OOM balance" {
    try sweep(success);
}

test "H5 chart create ownership late cap refusal has per trial no resize OOM balance" {
    try sweep(lateRefusal);
}

test "H5 chart create ownership all returned bytes survive caller buffer changes" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    const image = try a.dupe(u8, fixture.fallback);
    defer a.free(image);
    var series_name = [_]u8{ 'O', 'w', 'n' };
    var category = [_]u8{ 'O', 'n', 'e' };
    var number = [_]u8{ '1', '0' };
    const data: @import("../../hwpx/chart_create_data.zig").Data = .{
        .categories = &.{ &category, "Two", "Three" },
        .series = &.{.{ .name = &series_name, .values = &.{ &number, "20", "30" } }},
    };
    var prepared = try resources.prepare(a, input, fixture.version, fixture.names, data, image, .{});
    defer prepared.deinit(a);
    const saved_info = try a.dupe(u8, prepared.docinfo.bytes);
    defer a.free(saved_info);
    const saved_ole = try a.dupe(u8, prepared.ole);
    defer a.free(saved_ole);
    @memset(input, 0xaa);
    @memset(image, 0xbb);
    @memset(&series_name, 'X');
    @memset(&category, 'Y');
    @memset(&number, '9');
    try std.testing.expectEqualSlices(u8, saved_info, prepared.docinfo.bytes);
    try std.testing.expectEqualSlices(u8, saved_ole, prepared.ole);
    try std.testing.expectEqualSlices(u8, fixture.fallback, prepared.fallback);
    try std.testing.expectEqualStrings("/BinData/BIN0004", prepared.ole_path);
    try std.testing.expectEqualStrings("/BinData/BIN0005.png", prepared.fallback_path);
    var file = try @import("../../ole/container.zig").open(a, prepared.ole, .observed_size_prefix, .{ .strict = true });
    defer file.deinit();
    const chart = try file.findExact("/OOXMLChartContents") orelse return error.MissingChart;
    for ([_][]const u8{ "<c:v>Own</c:v>", "<c:v>One</c:v>", "<c:v>10</c:v>" }) |value|
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, file.entries[chart].content, value));
}

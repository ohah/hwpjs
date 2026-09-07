const std = @import("std");
const t = std.testing;
const background = @import("background.zig");
const histogram = @import("histogram.zig");
const Header = @import("header.zig").Header;
const pixels = @import("pixels.zig");
fn h(color: u8, depth: u8) Header {
    return .{ .width = 1, .height = 1, .color_type = color, .bit_depth = depth, .interlace = 0 };
}
test "PNG palette metadata background fields and shared sample masking" {
    for ([_]u8{ 0, 4 }) |color| for ([_]u8{ 8, 16 }) |depth| {
        const value = try background.parse(h(color, depth), 0, &.{ 255, 129 });
        try t.expectEqual(@as(u16, 65409), value.grayscale.raw);
        try t.expectEqual(@as(u16, if (depth == 8) 129 else 65409), value.grayscale.value);
    };
    for ([_]u8{ 2, 6 }) |color| {
        const value = try background.parse(h(color, 8), 0, &.{ 255, 1, 128, 2, 64, 3 });
        for (value.truecolor, 1..) |v, i| try t.expectEqual(i, v.value);
    }
    for (0..256) |index| {
        const v = try background.parse(h(3, 8), 256, &.{@intCast(index)});
        try t.expectEqual(index, v.indexed);
    }
    try t.expectError(error.InvalidPngBackgroundIndex, background.parse(h(3, 1), 1, &.{1}));
    try t.expectError(error.InvalidPngBackgroundSize, background.parse(h(3, 1), 1, &.{}));
    try t.expectError(error.UnsupportedPngFormat, @import("sample.zig").read(&.{ 0, 0 }, 0));
}
test "PNG palette metadata histogram size endian and owned frequencies" {
    var bytes: [512]u8 = undefined;
    for (0..256) |i| std.mem.writeInt(u16, bytes[i * 2 ..][0..2], @intCast(i * 257), .big);
    for (1..257) |count| {
        const value = try histogram.parse(h(3, 8), count, bytes[0 .. count * 2]);
        try t.expectEqual(count, value.count);
        for (value.frequencies[0..count], 0..) |v, i| try t.expectEqual(i * 257, v);
        try t.expectError(error.InvalidPngHistogramSize, histogram.parse(h(3, 8), count, bytes[0 .. count * 2 - 1]));
    }
    try t.expectError(error.InvalidPngPalette, histogram.parse(h(0, 8), 1, &.{ 0, 1 }));
    try t.expectError(error.InvalidPngPalette, histogram.parse(h(3, 8), 0, &.{}));
    try t.expectError(error.InvalidPngPalette, histogram.parse(h(3, 8), 257, &bytes));
    const owned = try histogram.parse(h(3, 8), 256, &bytes);
    @memset(&bytes, 0);
    try t.expectEqual(@as(u16, 65535), owned.frequencies[255]);
}
test "PNG palette metadata zero histogram rejects used indices not padding" {
    const indices = @import("palette_indices.zig");
    try indices.inspectWithHistogram(&.{127}, 1, 1, 2, &.{ 1, 0 });
    try t.expectError(error.InvalidPngHistogramUsage, indices.inspectWithHistogram(&.{127}, 2, 1, 2, &.{ 1, 0 }));
    try t.expectError(error.InvalidPngHistogramSize, indices.inspectWithHistogram(&.{0}, 1, 1, 2, &.{1}));
}
fn failure(a: std.mem.Allocator, input: []const u8, expected: anyerror) !void {
    if (pixels.inspect(a, input, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(expected, err),
    }
}
fn allocation(a: std.mem.Allocator, good: []const u8, bad_usage: []const u8, bad_background: []const u8) !void {
    const report = try pixels.inspect(a, good, .{});
    try t.expect(report.histogram_usage_validated);
    try t.expectEqual(@as(u8, 0), report.background.?.indexed);
    try t.expectEqual(@as(usize, 0), report.structure.ancillary_chunks_deferred);
    try failure(a, bad_usage, error.InvalidPngHistogramUsage);
    try failure(a, bad_background, error.InvalidPngBackgroundIndex);
}
test "PNG palette metadata integrated allocation cleanup at early and late errors" {
    const fixture = @import("pixels_fixture.zig");
    const good = try fixture.withMetadata(t.allocator, 0, &.{ .{ .name = "bKGD", .bytes = &.{0} }, .{ .name = "hIST", .bytes = &.{ 0, 1 } } });
    defer t.allocator.free(good);
    const bad_usage = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "hIST", .bytes = &.{ 0, 0 } }});
    defer t.allocator.free(bad_usage);
    const bad_background = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "bKGD", .bytes = &.{1} }});
    defer t.allocator.free(bad_background);
    try t.checkAllAllocationFailures(t.allocator, allocation, .{ good, bad_usage, bad_background });
}

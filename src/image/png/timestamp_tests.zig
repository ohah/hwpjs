const std = @import("std");
const t = std.testing;
const timestamp = @import("timestamp.zig");
const pixels = @import("pixels.zig");
test "PNG timestamp full year range and every component byte" {
    var bytes = [_]u8{ 0, 0, 1, 1, 0, 0, 0 };
    for (0..65536) |year| {
        std.mem.writeInt(u16, bytes[0..2], @intCast(year), .big);
        try t.expectEqual(year, (try timestamp.parse(&bytes)).year);
    }
    for ([_]u8{ 12, 31, 23, 59, 60 }, 2..) |max, i| {
        for (0..256) |value| {
            bytes[i] = @intCast(value);
            if (value <= max and (i > 3 or value > 0)) {
                const result = try timestamp.parse(&bytes);
                const fields = [_]u8{ result.month, result.day, result.hour, result.minute, result.second };
                try t.expectEqual(value, fields[i - 2]);
            } else try t.expectError(error.InvalidPngTimestampValue, timestamp.parse(&bytes));
        }
        bytes[i] = if (i <= 3) 1 else 0;
    }
    for (0..7) |len| try t.expectError(error.InvalidPngTimestampSize, timestamp.parse(bytes[0..len]));
    try t.expectError(error.InvalidPngTimestampSize, timestamp.parse(&(bytes ++ [_]u8{0})));
    const owned = try timestamp.parse(&bytes);
    @memset(&bytes, 0);
    try t.expectEqual(@as(u16, 65535), owned.year);
    try t.expectEqual(@as(u8, 1), owned.month);
    // PNG specifies component ranges, not Gregorian calendar or leap-second tables.
    try t.expectEqual(@as(u8, 31), (try timestamp.parse(&.{ 0, 0, 2, 31, 0, 0, 60 })).day);
}
test "PNG timestamp after IDAT and failed state atomicity" {
    var state: @import("metadata.zig").State = .{};
    const h: @import("header.zig").Header = .{ .width = 1, .height = 1, .color_type = 0, .bit_depth = 8, .interlace = 0 };
    try state.consume(h, 0, .{ .name = "IDAT".*, .payload = &.{}, .raw = &.{} });
    try t.expectError(error.InvalidPngTimestampValue, state.consume(h, 0, .{ .name = "tIME".*, .payload = &.{ 0, 0, 0, 1, 0, 0, 0 }, .raw = &.{} }));
    try t.expect(state.timestamp == null);
    try t.expectEqual(@as(usize, 0), state.validated_bytes);
    try state.consume(h, 0, .{ .name = "tIME".*, .payload = &.{ 7, 234, 9, 7, 12, 34, 60 }, .raw = &.{} });
    const saved = state;
    try t.expectError(error.DuplicatePngTimestamp, state.consume(h, 0, .{ .name = "tIME".*, .payload = &.{}, .raw = &.{} }));
    try t.expectEqualDeep(saved, state);
}
fn exercise(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const result = try pixels.inspect(a, good, .{});
    try t.expectEqual(@as(u8, 60), result.timestamp.?.second);
    try t.expectEqual(@as(usize, 0), result.structure.ancillary_chunks_deferred);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngTimestampValue, err),
    }
}
test "PNG timestamp integrated allocation cleanup" {
    const fixture = @import("pixels_fixture.zig");
    const good = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "tIME", .bytes = &.{ 7, 234, 9, 7, 12, 34, 60 } }});
    defer t.allocator.free(good);
    const bad = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "tIME", .bytes = &.{ 7, 234, 9, 7, 24, 34, 60 } }});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ good, bad });
}

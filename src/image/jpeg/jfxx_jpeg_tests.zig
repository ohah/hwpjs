const std = @import("std");
const t = std.testing;
const jpeg = @import("jfxx_jpeg.zig");

const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
const h = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const sof = [_]u8{ 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0 };
const scan = [_]u8{ 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0x5f };
const fixture = [_]u8{ 255, 216 } ++ q ++ h ++ sof ++ scan ++ .{ 255, 217 };

fn successful(allocator: std.mem.Allocator) !void {
    var image = try jpeg.decode(allocator, &fixture, .{ .max_samples = 1 });
    defer image.deinit(allocator);
    try t.expectEqual(@as(usize, 1), image.planes.len);
    try t.expectEqual(@as(u8, 1), image.planes[0].component.id);
    try t.expectEqualSlices(u16, &.{129}, image.planes[0].samples);
}

test "JPEG JFXX compressed thumbnail decodes baseline with allocation cleanup" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
    try t.expectError(error.LimitExceeded, jpeg.decode(t.allocator, &fixture, .{ .max_samples = 0 }));
    var bad = fixture;
    bad[bad.len - 3] = 0x40;
    try t.expectError(error.InvalidJpegEntropyPadding, jpeg.decode(t.allocator, &bad, .{}));
}

test "JPEG JFXX rejects embedded JFIF and JFXX before or after entropy" {
    for ([_][5]u8{ "JFIF\x00".*, "JFXX\x00".* }) |identifier| {
        const app = [_]u8{ 255, 224, 0, 7 } ++ identifier;
        const before = fixture[0..2].* ++ app ++ fixture[2..].*;
        const after = fixture[0 .. fixture.len - 2].* ++ app ++ .{ 255, 217 };
        try t.expectError(error.ForbiddenJfxxNestedMarker, jpeg.decode(t.allocator, &before, .{}));
        try t.expectError(error.ForbiddenJfxxNestedMarker, jpeg.decode(t.allocator, &after, .{}));
    }
    const app = [_]u8{ 255, 224, 0, 7, 'a', 'c', 'm', 'e', 0 };
    const other = fixture[0..2].* ++ app ++ fixture[2..].*;
    var image = try jpeg.decode(t.allocator, &other, .{});
    defer image.deinit(t.allocator);
}

test "JPEG JFXX compressed thumbnail rejects nonbaseline IDs trailing and oversized input" {
    var bad = fixture;
    const sof_at = 2 + q.len + h.len;
    for ([_]u8{ 193, 194, 195, 201, 202, 203 }) |code| {
        bad[sof_at + 1] = code;
        try t.expectError(error.UnsupportedJfxxJpegProcess, jpeg.decode(t.allocator, &bad, .{}));
    }
    bad = fixture;
    bad[sof_at + 10] = 9;
    try t.expectError(error.InvalidJfifComponentId, jpeg.decode(t.allocator, &bad, .{}));
    const trailing = fixture ++ .{0};
    try t.expectError(error.TrailingJpegBytes, jpeg.decode(t.allocator, &trailing, .{ .frame = .{ .structure = .{ .allow_trailing_bytes = true } } }));
    for (0..fixture.len) |n| {
        if (jpeg.decode(t.allocator, fixture[0..n], .{})) |value| {
            var image = value;
            image.deinit(t.allocator);
            return error.UnexpectedValidTruncation;
        } else |_| {}
    }
    const huge = [_]u8{0} ** 65528;
    try t.expectError(error.LimitExceeded, jpeg.decode(t.allocator, &huge, .{}));
}

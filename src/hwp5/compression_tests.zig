const std = @import("std");
const a = std.testing.allocator;
const deflate = @import("../compression/raw_deflate.zig");

const stored = [_]u8{ 1, 3, 0, 252, 255, 'a', 'b', 'c' };
fn allocationExercise(allocator: std.mem.Allocator) !void {
    const out = try deflate.decode(allocator, &stored, 3);
    defer allocator.free(out);
    try std.testing.expectEqualStrings("abc", out);
}
test "raw DEFLATE bounded output truncation trailing data and allocation cleanup" {
    try std.testing.checkAllAllocationFailures(a, allocationExercise, .{});
    try std.testing.expectError(error.LimitExceeded, deflate.decode(a, &stored, 2));
    for (0..stored.len) |n| try std.testing.expectError(error.InvalidDeflate, deflate.decode(a, stored[0..n], 3));
    try std.testing.expectError(error.InvalidDeflate, deflate.decode(a, &.{7}, 3));
    try std.testing.expectError(error.TrailingData, deflate.decode(a, &(stored ++ .{0}), 3));
    const empty = try deflate.decode(a, &.{ 3, 0 }, 0);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
}

fn trailerExercise(allocator: std.mem.Allocator, bytes: []const u8) !void {
    const compressed = @import("compressed_stream.zig");
    const out = try compressed.decode(allocator, bytes, 3);
    defer allocator.free(out);
    try std.testing.expectEqualStrings("abc", out);
    var bad: [16]u8 = bytes[0..16].*;
    bad[8] ^= 1;
    if (compressed.decode(allocator, &bad, 3)) |unexpected| {
        allocator.free(unexpected);
        return error.ExpectedInvalidChecksum;
    } else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try std.testing.expectEqual(error.InvalidChecksum, err),
    }
}
test "HWP trailer checks CRC and length and cleans up errors" {
    // CRC32('abc') = 0x352441c2, little endian; independent known vector.
    const bytes = stored ++ [_]u8{ 0xc2, 0x41, 0x24, 0x35, 3, 0, 0, 0 };
    try std.testing.checkAllAllocationFailures(a, trailerExercise, .{&bytes});
    const compressed = @import("compressed_stream.zig");
    for (8..16) |i| {
        var bad = bytes;
        bad[i] ^= 1;
        try std.testing.expectError(error.InvalidChecksum, compressed.decode(a, &bad, 3));
    }
    for (9..16) |n| try std.testing.expectError(error.TrailingData, compressed.decode(a, bytes[0..n], 3));
    try std.testing.expectError(error.TrailingData, compressed.decode(a, &(bytes ++ .{0}), 3));
    const no_trailer = try compressed.decode(a, &stored, 3);
    defer a.free(no_trailer);
    try std.testing.expectEqualStrings("abc", no_trailer);
}

const std = @import("std");
const a = std.testing.allocator;
const deflate = @import("../compression/raw_deflate.zig");

const stored = [_]u8{ 1, 3, 0, 252, 255, 'a', 'b', 'c' };

fn expectStoredWire(input: []const u8, encoded: []const u8) !void {
    var source: usize = 0;
    var offset: usize = 0;
    var blocks: usize = 0;
    while (true) {
        try std.testing.expect(offset + 5 <= encoded.len);
        const header = encoded[offset];
        try std.testing.expect(header == 0 or header == 1);
        const len = std.mem.readInt(u16, encoded[offset + 1 ..][0..2], .little);
        const inverse = std.mem.readInt(u16, encoded[offset + 3 ..][0..2], .little);
        try std.testing.expectEqual(~len, inverse);
        offset += 5;
        try std.testing.expect(offset + len <= encoded.len and source + len <= input.len);
        try std.testing.expectEqualSlices(u8, input[source..][0..len], encoded[offset..][0..len]);
        source += len;
        offset += len;
        blocks += 1;
        if (header == 1) break;
    }
    try std.testing.expectEqual(input.len, source);
    try std.testing.expectEqual(encoded.len, offset);
    try std.testing.expectEqual(if (input.len == 0) @as(usize, 1) else (input.len - 1) / 65535 + 1, blocks);
}

fn encodeExercise(allocator: std.mem.Allocator, input: []const u8) !void {
    const blocks = if (input.len == 0) @as(usize, 1) else (input.len - 1) / 65535 + 1;
    const exact = input.len + blocks * 5;
    const encoded = try deflate.encodeStored(allocator, input, exact);
    defer allocator.free(encoded);
    try expectStoredWire(input, encoded);
    const decoded = try deflate.decode(allocator, encoded, input.len);
    defer allocator.free(decoded);
    try std.testing.expectEqualSlices(u8, input, decoded);
    try std.testing.expectError(error.LimitExceeded, deflate.encodeStored(allocator, input, exact - 1));
}

test "raw DEFLATE stored encoder has exact independent block boundaries" {
    const empty = try deflate.encodeStored(a, "", 5);
    defer a.free(empty);
    try std.testing.expectEqualSlices(u8, &.{ 1, 0, 0, 255, 255 }, empty);
    const abc = try deflate.encodeStored(a, "abc", stored.len);
    defer a.free(abc);
    try std.testing.expectEqualSlices(u8, &stored, abc);
    const input = try a.alloc(u8, 131071);
    defer a.free(input);
    for (input, 0..) |*byte, i| byte.* = @truncate(i *% 131 +% 17);
    for ([_]usize{ 0, 1, 65534, 65535, 65536, 131070, 131071 }) |len| {
        try encodeExercise(a, input[0..len]);
        try std.testing.checkAllAllocationFailures(a, encodeExercise, .{input[0..len]});
    }
}
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

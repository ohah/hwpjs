const std = @import("std");
const zlib = @import("zlib.zig");
const raw = @import("raw_deflate.zig");
const t = std.testing;
const empty = [_]u8{ 0x78, 0x9c, 3, 0, 0, 0, 0, 1 };
// Stored block containing 'abc'; Adler32 = 0x024d0127.
const abc = [_]u8{ 0x78, 1, 1, 3, 0, 0xfc, 0xff, 'a', 'b', 'c', 2, 0x4d, 1, 0x27 };

test "zlib exact output, checksum, truncation and trailing boundaries" {
    const zero = try zlib.decode(t.allocator, &empty, 0);
    defer t.allocator.free(zero);
    try t.expectEqual(@as(usize, 0), zero.len);
    const decoded = try zlib.decode(t.allocator, &abc, 3);
    defer t.allocator.free(decoded);
    try t.expectEqualStrings("abc", decoded);
    try t.expectError(error.LimitExceeded, zlib.decode(t.allocator, &abc, 2));
    for (0..abc.len) |end| {
        if (zlib.decode(t.allocator, abc[0..end], 3)) |out| {
            t.allocator.free(out);
            return error.AcceptedTruncation;
        } else |_| {}
    }
    var corrupt = abc;
    for (10..14) |i| {
        corrupt[i] ^= 1;
        try t.expectError(error.InvalidChecksum, zlib.decode(t.allocator, &corrupt, 3));
        corrupt[i] ^= 1;
    }
    try t.expectError(error.TrailingData, zlib.decode(t.allocator, &(abc ++ empty), 3));
    try t.expectError(error.TrailingData, zlib.decode(t.allocator, &(abc ++ [_]u8{0}), 3));
    const prefix = try zlib.decodePrefix(t.allocator, &(abc ++ empty), 3);
    defer t.allocator.free(prefix.bytes);
    try t.expectEqual(abc.len, prefix.consumed);
    try t.expectEqualStrings("abc", prefix.bytes);
    try t.expectError(error.InvalidWindowSize, raw.decodePrefixWindow(t.allocator, &.{ 3, 0 }, 0, 0));
    try t.expectError(error.InvalidWindowSize, raw.decodePrefixWindow(t.allocator, &.{ 3, 0 }, 0, 32769));
}

test "zlib all 65536 headers independently classified" {
    var bytes = empty;
    for (0..65536) |h| {
        bytes[0] = @intCast(h >> 8);
        bytes[1] = @truncate(h);
        const method = (h >> 8) % 16;
        const info = h >> 12;
        if (method != 8 or info > 7 or h % 31 != 0) {
            try t.expectError(error.InvalidZlibHeader, zlib.decode(t.allocator, &bytes, 0));
        } else if (h & 32 != 0) {
            try t.expectError(error.UnsupportedZlibDictionary, zlib.decode(t.allocator, &bytes, 0));
        } else {
            const out = try zlib.decode(t.allocator, &bytes, 0);
            t.allocator.free(out);
        }
    }
}

fn allocation(a: std.mem.Allocator) !void {
    const out = try zlib.decode(a, &abc, 3);
    defer a.free(out);
    var corrupt = abc;
    corrupt[13] ^= 1;
    if (zlib.decode(a, &corrupt, 3)) |unexpected| {
        a.free(unexpected);
        return error.ExpectedInvalidChecksum;
    } else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidChecksum, err),
    }
}

test "zlib allocation failure cleanup" {
    try t.checkAllAllocationFailures(t.allocator, allocation, .{});
}

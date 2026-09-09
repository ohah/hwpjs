const std = @import("std");
const t = std.testing;
const Bits = @import("entropy_bits.zig").Bits;

fn stuff(raw: []const u8, out: []u8) []const u8 {
    var n: usize = 0;
    for (raw) |byte| {
        out[n] = byte;
        n += 1;
        if (byte == 255) {
            out[n] = 0;
            n += 1;
        }
    }
    return out[0..n];
}

test "JPEG entropy MSB bit reads at every offset and width preserve stuffed bytes" {
    for (0..256) |value| {
        const raw = [_]u8{ @intCast(value), 255, 0, 0xa5, 0x69 };
        var encoded: [10]u8 = undefined;
        const bytes = stuff(&raw, &encoded);
        for (0..8) |skip| for (0..33) |width| {
            var bits = try Bits.init(bytes, bytes.len);
            _ = try bits.read(@intCast(skip));
            var expected: u32 = 0;
            for (skip..skip + width) |at| expected = (expected << 1) | ((raw[at / 8] >> @as(u3, @intCast(7 - at % 8))) & 1);
            try t.expectEqual(expected, try bits.read(@intCast(width)));
        };
    }
}

test "JPEG entropy end padding checks every byte and bit boundary" {
    for (0..256) |value| for (1..9) |consumed| {
        const raw = [_]u8{@intCast(value)};
        var encoded: [2]u8 = undefined;
        var bits = try Bits.init(stuff(&raw, &encoded), 2);
        _ = try bits.read(@intCast(consumed));
        const before = bits;
        const mask = (@as(u16, 1) << @as(u4, @intCast(8 - consumed))) - 1;
        if (value & mask == mask) {
            try bits.finish();
            try t.expectEqual(@as(u4, 0), bits.remaining);
        } else {
            try t.expectError(error.InvalidJpegEntropyPadding, bits.finish());
            try t.expectEqualDeep(before, bits);
        }
    };
    var unread = try Bits.init(&.{ 255, 0 }, 2);
    try t.expectError(error.TrailingJpegEntropyBytes, unread.finish());
    var empty = try Bits.init(&.{}, 0);
    try t.expectEqual(@as(u32, 0), try empty.read(0));
    try empty.finish();
}

test "JPEG entropy malformed stuffing truncation and wide reads are atomic" {
    for ([_][]const u8{ &.{0x42}, &.{ 0x42, 255 } }) |bytes| {
        var bits = try Bits.init(bytes, bytes.len);
        _ = try bits.read(4);
        const before = bits;
        try t.expectError(error.UnexpectedEnd, bits.read(12));
        try t.expectEqualDeep(before, bits);
    }
    for (1..256) |marker| {
        const bytes = [_]u8{ 0x42, 255, @intCast(marker), 0 };
        var bits = try Bits.init(&bytes, bytes.len);
        _ = try bits.read(4);
        const before = bits;
        try t.expectError(error.UnexpectedJpegEntropyMarker, bits.read(12));
        try t.expectEqualDeep(before, bits);
    }
    var bits = try Bits.init(&.{ 255, 0, 255, 0, 255, 0, 255, 0 }, 8);
    for (33..64) |count| try t.expectError(error.InvalidJpegBitCount, bits.read(@intCast(count)));
    try t.expectEqual(@as(u32, 0xffffffff), try bits.read(32));
    try bits.finish();
    try t.expectError(error.LimitExceeded, Bits.init(&.{ 1, 2 }, 1));
}

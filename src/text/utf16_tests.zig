const std = @import("std");
const t = std.testing;
const utf16 = @import("utf16.zig");
const scalars = @import("scalars.zig");
test "all UTF16 single units retain scalar policy independent of XML" {
    for ([_]std.builtin.Endian{ .big, .little }) |order| for (0..65536) |v| {
        var b: [2]u8 = undefined;
        std.mem.writeInt(u16, &b, @intCast(v), order);
        if (v >= 0xd800 and v <= 0xdbff) {
            try t.expectError(error.UnexpectedEnd, utf16.inspect(&b, order));
        } else if (v >= 0xdc00 and v <= 0xdfff) {
            try t.expectError(error.InvalidUnicodeEncoding, utf16.inspect(&b, order));
        } else {
            const s = try utf16.inspect(&b, order);
            try t.expectEqual(@as(usize, 1), s.scalars);
            try t.expectEqual(@intFromBool(v == 0), s.nul_scalars);
            try t.expectEqual(@intFromBool(v == 0xfeff), s.bom_scalars);
        }
    };
}
test "all supplementary scalar values decode from UTF16 in either byte order" {
    for ([_]std.builtin.Endian{ .big, .little }) |order| for (0x10000..0x110000) |value| {
        var units: [2]u16 = undefined;
        var encoded: [4]u8 = undefined;
        const len = try std.unicode.utf8Encode(@intCast(value), &encoded);
        try t.expectEqual(@as(usize, 2), try std.unicode.utf8ToUtf16Le(&units, encoded[0..len]));
        var b: [4]u8 = undefined;
        std.mem.writeInt(u16, b[0..2], std.mem.readInt(u16, std.mem.asBytes(&units)[0..2], .little), order);
        std.mem.writeInt(u16, b[2..4], std.mem.readInt(u16, std.mem.asBytes(&units)[2..4], .little), order);
        const s = (try scalars.read(&b, 0, if (order == .big) .utf16be else .utf16le)).?;
        try t.expectEqual(value, s.value);
        try t.expectEqual(@as(usize, 4), s.end);
    };
    try t.expectError(error.UnexpectedEnd, utf16.inspect(&.{0}, .big));
    try t.expectError(error.InvalidUnicodeEncoding, utf16.inspect(&.{ 0xd8, 0, 0, 65 }, .big));
}

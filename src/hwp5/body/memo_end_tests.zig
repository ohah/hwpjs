const std = @import("std");
const t = std.testing;
const m = @import("memo_end.zig");
test "memo end keeps full raw words and never guesses another signature" {
    var b = [_]u8{0} ** 13;
    std.mem.writeInt(u32, b[0..4], 0x00256d65, .little);
    for ([_]u32{ 0, 1, 0x00ffff01, 0x80000000, 0xffffffff }) |middle| {
        std.mem.writeInt(u32, b[4..8], middle, .little);
        for ([_]u32{ 0, 1, 65536, 0x80000000, 0xffffffff }) |index| {
            std.mem.writeInt(u32, b[8..12], index, .little);
            try t.expectEqualDeep(m.End{ .middle_raw = middle, .memo_index = index }, (try m.parse(b[0..12])).?);
        }
    }
    for (0..12) |cut| try t.expectError(error.UnexpectedEnd, m.parse(b[0..cut]));
    try t.expectError(error.InvalidMemoEndSize, m.parse(&b));
    for (0..4) |at| for (0..8) |bit| {
        b[at] ^= @as(u8, 1) << @intCast(bit);
        try t.expectEqual(null, try m.parse(b[0..12]));
        b[at] ^= @as(u8, 1) << @intCast(bit);
    };
}

const std = @import("std");
const t = std.testing;
const memo = @import("memo_list.zig");
test "memo list preserves zero high bits extra and rejects every short prefix" {
    var b = [_]u8{0} ** 7;
    @memcpy(b[4..], &[_]u8{ 0, 128, 255 });
    for ([_]u32{ 0, 1, 3, 65536, 0x80000000, 0xffffffff }) |n| {
        std.mem.writeInt(u32, b[0..4], n, .little);
        for (4..8) |end| {
            const p = try memo.Header.parse(b[0..end]);
            try t.expectEqual(n, p.memo_index);
            try t.expectEqualSlices(u8, b[4..end], p.extra);
            try t.expectEqual(b[4..].ptr, p.extra.ptr);
        }
        for (0..4) |cut| try t.expectError(error.UnexpectedEnd, memo.Header.parse(b[0..cut]));
    }
}
test "body memo dispatch preserves framing and retries short records atomically" {
    const body = @import("reader.zig");
    var b = [_]u8{0} ** 8;
    for (0..4) |n| {
        std.mem.writeInt(u32, b[0..4], 93 | (1 << 10) | (@as(u32, @intCast(n)) << 20), .little);
        var it = try body.Iterator.init(b[0 .. n + 4], .{ .raw = 0x05000107 }, .{});
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectError(error.UnexpectedEnd, it.next());
    }
    std.mem.writeInt(u32, b[0..4], 93 | (1 << 10) | (4 << 20), .little);
    std.mem.writeInt(u32, b[4..8], 0xffffffff, .little);
    var it = try body.Iterator.init(&b, .{ .raw = 0x05010001 }, .{});
    const r = (try it.next()).?;
    try t.expectEqual(1, r.framing.level);
    try t.expectEqual(0xffffffff, r.value.memo_list.memo_index);
    try t.expectEqualSlices(u8, &b, r.framing.raw);
    try t.expectEqual(null, try it.next());
}

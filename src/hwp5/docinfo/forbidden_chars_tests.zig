const std = @import("std");
const t = std.testing;
const Lists = @import("forbidden_chars.zig").Lists;
test "observed forbidden lists count header precedes borrowed UTF16 lists and opaque extra" {
    var bytes = [_]u8{0} ** 39;
    for (0..4) |i| std.mem.writeInt(u32, bytes[i * 4 ..][0..4], @intCast(i + 1), .little);
    for (bytes[16..], 0..) |*byte, i| byte.* = @intCast(i);
    const p = try Lists.parseObserved(&bytes);
    var at: usize = 16;
    for (p.lists, 0..) |list, i| {
        try t.expectEqual((i + 1) * 2, list.len);
        try t.expectEqual(@intFromPtr(bytes[at..].ptr), @intFromPtr(list.ptr));
        try t.expectEqualSlices(u8, bytes[at..][0..list.len], list);
        at += list.len;
    }
    try t.expectEqualSlices(u8, bytes[36..], p.extra);
    for (0..36) |cut| try t.expectError(error.UnexpectedEnd, Lists.parseObserved(bytes[0..cut]));
    for (36..40) |cut| try t.expectEqual(cut - 36, (try Lists.parseObserved(bytes[0..cut])).extra.len);
    for (0..4) |i| {
        var bad = bytes;
        std.mem.writeInt(u32, bad[i * 4 ..][0..4], std.math.maxInt(u32), .little);
        try t.expectError(error.UnexpectedEnd, Lists.parseObserved(&bad));
    }
}
test "observed forbidden lists preserve empty NUL surrogate and odd trailing bytes" {
    var b = [_]u8{0} ** 23;
    std.mem.writeInt(u32, b[8..12], 3, .little);
    std.mem.writeInt(u16, b[16..18], 0xd800, .little);
    std.mem.writeInt(u16, b[20..22], 0xdc00, .little);
    b[22] = 0xff;
    const p = try Lists.parseObserved(&b);
    try t.expectEqualSlices(u8, b[16..22], p.lists[2]);
    for ([_]usize{ 0, 1, 3 }) |i| try t.expectEqual(0, p.lists[i].len);
    try t.expectEqualSlices(u8, &.{0xff}, p.extra);
    const empty = try Lists.parseObserved(&([_]u8{0} ** 16));
    for (empty.lists) |list| try t.expectEqual(0, list.len);
}

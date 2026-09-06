const std = @import("std");
const t = std.testing;
const d = @import("reader.zig");
test "compatibility target preserves unknown unsigned values and extra bytes" {
    var bytes = [_]u8{0} ** 5;
    bytes[4] = 9;
    for ([_]u32{ 0, 1, 2, 3, 0x80000000, 0xffffffff }) |n| {
        std.mem.writeInt(u32, bytes[0..4], n, .little);
        const v = try d.CompatibleDocument.parse(&bytes);
        try t.expectEqual(n, @intFromEnum(v.target));
        try t.expectEqualSlices(u8, &.{9}, v.extra);
    }
    for (0..4) |n| try t.expectError(error.UnexpectedEnd, d.CompatibleDocument.parse(bytes[0..n]));
}
test "layout five DWORDs remain independent with an odd extension" {
    var bytes = [_]u8{0} ** 21;
    const values = [_]u32{ 1, 0x80000000, 0xffffffff, 0x12345678, 0x87654321 };
    for (values, 0..) |n, i| std.mem.writeInt(u32, bytes[i * 4 ..][0..4], n, .little);
    bytes[20] = 7;
    const v = try d.LayoutCompatibility.parse(&bytes);
    try t.expectEqualSlices(u32, &values, &.{ v.character, v.paragraph, v.section, v.object, v.field });
    try t.expectEqualSlices(u8, &.{7}, v.extra);
    for (0..20) |n| try t.expectError(error.UnexpectedEnd, d.LayoutCompatibility.parse(bytes[0..n]));
}
test "compatibility dispatch rejects wrong levels atomically" {
    var bytes = [_]u8{0} ** 24;
    for ([_]u10{ 30, 31 }) |tag| {
        const size: usize = if (tag == 30) 4 else 20;
        const wrong: u32 = if (tag == 30) 1 else 0;
        std.mem.writeInt(u32, bytes[0..4], @as(u32, tag) | (wrong << 10) | (@as(u32, @intCast(size)) << 20), .little);
        var it = try d.Iterator.init(bytes[0 .. 4 + size], .{ .raw = 0x05000107 }, .{});
        for (0..2) |_| try t.expectError(error.InvalidDocInfoLevel, it.next());
        try t.expectEqual(0, it.records.reader.offset);
        try t.expectEqual(0, it.records.count);
    }
}

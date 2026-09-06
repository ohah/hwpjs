const std = @import("std");
const t = std.testing;
const memo = @import("memo_shape.zig");
test "memo shape preserves distinct fields high bits unknown DWORD and extra" {
    var b = [_]u8{0} ** 25;
    std.mem.writeInt(u32, b[0..4], 0xffffffff, .little);
    b[4] = 255;
    b[5] = 128;
    for ([_]u32{ 0x81234567, 0x89abcdef, 0xfedcba98, 0x80000002 }, 0..) |v, i| std.mem.writeInt(u32, b[6 + i * 4 ..][0..4], v, .little);
    @memcpy(b[22..], &[_]u8{ 9, 128, 255 });
    const p = try memo.Shape.parse(&b);
    try t.expectEqual(0xffffffff, p.width);
    try t.expectEqual(255, p.border.kind);
    try t.expectEqual(128, p.border.width);
    try t.expectEqual(0x81234567, p.border.color);
    try t.expectEqual(0x89abcdef, p.fill_color);
    try t.expectEqual(0xfedcba98, p.active_color);
    try t.expectEqual(0x80000002, p.unknown_raw);
    try t.expectEqualSlices(u8, b[22..], p.extra);
    try t.expectEqual(b[22..].ptr, p.extra.ptr);
    for (0..22) |cut| try t.expectError(error.UnexpectedEnd, memo.Shape.parse(b[0..cut]));
    for (22..26) |end| try t.expectEqual(end - 22, (try memo.Shape.parse(b[0..end])).extra.len);
}
test "shared six-byte border read fails atomically from a nonzero cursor" {
    const b = [_]u8{255} ** 7;
    for (1..7) |end| {
        var r: @import("../../binary/reader.zig").Reader = .{ .bytes = b[0..end], .offset = 1 };
        try t.expectError(error.UnexpectedEnd, @import("border_line.zig").Border.read(&r));
        try t.expectEqual(1, r.offset);
    }
    var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &b, .offset = 1 };
    try t.expectEqual(0xffffffff, (try @import("border_line.zig").Border.read(&r)).color);
    try t.expectEqual(7, r.offset);
}

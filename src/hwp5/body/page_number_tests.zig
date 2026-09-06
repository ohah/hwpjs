const std = @import("std");
const t = std.testing;
const P = @import("page_number.zig").Properties;
test "page number fields preserve all code units and odd tails" {
    const b = [_]u8{ 0xff, 0xff, 0xff, 0xff, 0, 0xd8, 0, 0, 0xff, 0xfe, 0, 0, 7 };
    const p = try P.parse(&b);
    try t.expectEqual(0xd800, p.symbol);
    try t.expectEqual(0, p.prefix);
    try t.expectEqual(0xfeff, p.suffix);
    try t.expectEqual(0, p.dash);
    try t.expectEqualSlices(u8, &.{7}, p.extra);
    for (0..12) |len| try t.expectError(error.UnexpectedEnd, P.parse(b[0..len]));
}
test "page number shape and position extract only their own bits" {
    var b = [_]u8{0} ** 12;
    for (0..32) |bit| {
        const n = @as(u32, 1) << @intCast(bit);
        std.mem.writeInt(u32, b[0..4], n, .little);
        const p = try P.parse(&b);
        try t.expectEqual(n & 255, p.shape());
        try t.expectEqual((n >> 8) & 15, p.position());
    }
}

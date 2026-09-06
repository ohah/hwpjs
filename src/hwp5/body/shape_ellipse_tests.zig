const std = @import("std");
const t = std.testing;
const ellipse = @import("shape_ellipse.zig");
test "ellipse preserves seven signed points even when arc flag is clear" {
    try t.expectEqual(80, ellipse.tag);
    var raw = [_]u8{0} ** 63;
    raw[60..].* = .{ 9, 128, 255 };
    const values = [_]i32{ -2147483648, 2147483647, -1, 0, 123, -456, 789, -1024, 2048, -4096, 8192, -16384, 32768, -65536 };
    for (values, 0..) |value, i| std.mem.writeInt(i32, raw[4 + i * 4 ..][0..4], value, .little);
    const p = try ellipse.Ellipse.parse(&raw);
    try t.expect(!p.isArc());
    inline for (.{ "center", "axis1", "axis2", "start1", "end1", "start2", "end2" }, 0..) |field, i| {
        try t.expectEqual(values[i * 2], @field(p, field).x);
        try t.expectEqual(values[i * 2 + 1], @field(p, field).y);
    }
    try t.expectEqualSlices(u8, raw[60..], p.extra);
    try t.expectEqual(raw[60..].ptr, p.extra.ptr);
    for (0..60) |n| try t.expectError(error.UnexpectedEnd, ellipse.Ellipse.parse(raw[0..n]));
    try t.expectEqual(0, (try ellipse.Ellipse.parse(raw[0..60])).extra.len);
}
test "ellipse attribute views isolate all 32 bits and retain reserved values" {
    var raw = [_]u8{0} ** 60;
    for (0..32) |bit| {
        const value = @as(u32, 1) << @intCast(bit);
        std.mem.writeInt(u32, raw[0..4], value, .little);
        const p = try ellipse.Ellipse.parse(&raw);
        try t.expectEqual(value, p.attributes);
        try t.expectEqual(bit == 0, p.needsIntervalUpdate());
        try t.expectEqual(bit == 1, p.isArc());
        try t.expectEqual(if (bit >= 2 and bit <= 9) @as(u8, 1) << @intCast(bit - 2) else @as(u8, 0), p.arcKindRaw());
        try t.expectEqual(if (bit >= 10) value else @as(u32, 0), p.unknownBits());
    }
    std.mem.writeInt(u32, raw[0..4], 0xffffffff, .little);
    try t.expectEqual(255, (try ellipse.Ellipse.parse(&raw)).arcKindRaw());
}

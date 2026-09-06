const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Alpha = @import("../docinfo/fill_alpha.zig").Alpha;
test "per-type alpha keeps zero and mixed types in pattern-gradient-image order" {
    for (0..8) |flags| {
        const values = [_]u8{ 0, 128, 255 };
        var r: Reader = .{ .bytes = &values };
        const a = try Alpha.read(&r, @intCast(flags));
        var expected: usize = 0;
        inline for (.{ "pattern", "gradient", "image" }, .{ 1, 4, 2 }) |field, mask| {
            if (flags & mask != 0) {
                try t.expectEqual(values[expected], @field(a, field).?);
                expected += 1;
            } else try t.expectEqual(null, @field(a, field));
        }
        try t.expectEqual(expected, r.offset);
        for (0..expected) |n| {
            var short: Reader = .{ .bytes = values[0..n] };
            try t.expectError(error.UnexpectedEnd, Alpha.read(&short, @intCast(flags)));
            try t.expectEqual(0, short.offset);
        }
    }
    var r: Reader = .{ .bytes = &.{} };
    try t.expectError(error.UnsupportedFillKind, Alpha.read(&r, 8));
    try t.expectEqual(0, r.offset);
}
test "drawing shadow widths and unknown fill do not consume guessed tails" {
    const Style = @import("drawing_style.zig").Style;
    var raw = [_]u8{0} ** 38;
    std.mem.writeInt(u32, raw[21..25], 0xffffffff, .little);
    std.mem.writeInt(u32, raw[25..29], 0x80000000, .little);
    std.mem.writeInt(i32, raw[29..33], -2147483648, .little);
    std.mem.writeInt(i32, raw[33..37], 2147483647, .little);
    raw[37] = 9;
    const p = try Style.parse(&raw, .observed13);
    try t.expectEqual(0xffffffff, p.tail.known.shadow.kind);
    try t.expectEqual(0x80000000, p.tail.known.shadow.color);
    try t.expectEqual(-2147483648, p.tail.known.shadow.offset_x);
    try t.expectEqual(2147483647, p.tail.known.shadow.offset_y);
    try t.expectEqualSlices(u8, &.{9}, p.tail.known.extra);
    for (0..37) |n| try t.expectError(error.UnexpectedEnd, Style.parse(raw[0..n], .observed13));
    for (0..16) |n| {
        var r: Reader = .{ .bytes = raw[21..][0..n] };
        try t.expectError(error.UnexpectedEnd, @import("shadow.zig").Shadow.read(&r));
        try t.expectEqual(0, r.offset);
    }
    std.mem.writeInt(u32, raw[13..17], 0x80000000, .little);
    const unknown = try Style.parse(&raw, .observed13);
    try t.expectEqualSlices(u8, raw[17..], unknown.tail.unknown);
    try t.expectEqual(0, (try Style.parse(raw[0..17], .observed13)).tail.unknown.len);
}

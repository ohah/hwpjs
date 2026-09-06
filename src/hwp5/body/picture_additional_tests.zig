const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const additional = @import("picture_additional.zig");
const tail = @import("picture_tail.zig");
test "additional dimensions and alpha keep unsigned sizes and absent versus zero" {
    var b = [_]u8{0} ** 11;
    std.mem.writeInt(u32, b[1..5], 0xffffffff, .little);
    std.mem.writeInt(u32, b[5..9], 0x80000000, .little);
    for ([_]additional.Layout{ .dimensions8, .with_alpha9 }, [_]usize{ 8, 9 }) |layout, size| {
        for ([_]u8{ 0, 127, 128, 255 }) |alpha| {
            b[9] = alpha;
            var r: Reader = .{ .bytes = &b, .offset = 1 };
            const p = try additional.Additional.read(&r, layout);
            try t.expectEqual(1 + size, r.offset);
            try t.expectEqual(@as(u32, 0xffffffff), p.width);
            try t.expectEqual(@as(u32, 0x80000000), p.height);
            try t.expectEqual(@as(?u8, if (layout == .with_alpha9) alpha else null), p.alphaByte());
            try t.expectEqual(@as(?i8, if (layout == .with_alpha9) @bitCast(alpha) else null), p.alpha);
        }
        for (1..1 + size) |cut| {
            var r: Reader = .{ .bytes = b[0..cut], .offset = 1 };
            try t.expectError(error.UnexpectedEnd, additional.Additional.read(&r, layout));
            try t.expectEqual(1, r.offset);
        }
    }
    var r: Reader = .{ .bytes = &b, .offset = std.math.maxInt(usize) };
    try t.expectError(error.UnexpectedEnd, additional.Additional.read(&r, .dimensions8));
    try t.expectEqual(std.math.maxInt(usize), r.offset);
}
test "picture tail consumes effects before dimensions and is atomic across both" {
    var b = [_]u8{0} ** 19;
    b[1] = 4; // soft edge, then width/height/alpha
    std.mem.writeInt(u32, b[5..9], 0x7fc12345, .little);
    std.mem.writeInt(u32, b[9..13], 1234, .little);
    std.mem.writeInt(u32, b[13..17], 5678, .little);
    b[17] = 255;
    for ([_]?additional.Layout{ null, .dimensions8, .with_alpha9 }, [_]usize{ 8, 16, 17 }) |layout, size| {
        var r: Reader = .{ .bytes = &b, .offset = 1 };
        const p = try tail.Tail.read(&r, layout);
        try t.expectEqual(1 + size, r.offset);
        try t.expectEqual(@as(u32, 0x7fc12345), p.effects.soft_edge_radius_bits.?);
        if (layout) |selected| {
            try t.expectEqual(1234, p.properties.?.width);
            try t.expectEqual(5678, p.properties.?.height);
            try t.expectEqual(@as(?i8, if (selected == .with_alpha9) -1 else null), p.properties.?.alpha);
        } else try t.expect(p.properties == null);
        for (1..1 + size) |cut| {
            r = .{ .bytes = b[0..cut], .offset = 1 };
            try t.expectError(error.UnexpectedEnd, tail.Tail.read(&r, layout));
            try t.expectEqual(1, r.offset);
        }
    }
    b[1] = 16;
    var r: Reader = .{ .bytes = &b, .offset = 1 };
    try t.expectError(error.UnsupportedPictureEffects, tail.Tail.read(&r, .with_alpha9));
    try t.expectEqual(1, r.offset);
}

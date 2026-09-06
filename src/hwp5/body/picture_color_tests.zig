const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const color = @import("picture_color.zig");
const effect = @import("picture_color_effect.zig");
test "picture color bounds and failures are atomic at a nonzero cursor" {
    var b = [_]u8{0} ** 30;
    std.mem.writeInt(u32, b[5..9], 0xffabcdef, .little);
    std.mem.writeInt(u32, b[9..13], 2, .little);
    std.mem.writeInt(i32, b[13..17], -1, .little);
    std.mem.writeInt(u32, b[17..21], 0x7fc12345, .little);
    std.mem.writeInt(i32, b[21..25], 27, .little);
    std.mem.writeInt(u32, b[25..29], 0x80000000, .little);
    var r: Reader = .{ .bytes = &b, .offset = 1 };
    const p = try color.Color.read(&r);
    try t.expectEqual(29, r.offset);
    try t.expectEqual(@as(u32, 0xffabcdef), p.value_raw);
    try t.expectEqual(@intFromPtr(b[13..].ptr), @intFromPtr(p.effects.raw.ptr));
    try t.expectEqual(2, p.effects.count());
    try t.expect(p.effects.get(2) == null);
    try t.expect(p.effects.get(std.math.maxInt(usize)) == null);
    try t.expect(p.effects.get(0).?.kind() == null);
    try t.expect(std.math.isNan(p.effects.get(0).?.value()));
    try t.expectEqual(@as(u32, 0x7fc12345), p.effects.get(0).?.value_bits);
    try t.expectEqual(effect.Kind.inv, p.effects.get(1).?.kind().?);
    try t.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(p.effects.get(1).?.value())));
    for (1..29) |cut| {
        r = .{ .bytes = b[0..cut], .offset = 1 };
        try t.expectError(error.UnexpectedEnd, color.Color.read(&r));
        try t.expectEqual(1, r.offset);
    }
    for ([_]u32{ 3, 0x80000000, 0xffffffff }) |count| {
        std.mem.writeInt(u32, b[9..13], count, .little);
        r = .{ .bytes = &b, .offset = 1 };
        try t.expectError(error.UnexpectedEnd, color.Color.read(&r));
        try t.expectEqual(1, r.offset);
    }
    b[1] = 1;
    r = .{ .bytes = &b, .offset = 1 };
    try t.expectError(error.UnsupportedPictureColorType, color.Color.read(&r));
    try t.expectEqual(1, r.offset);
    r = .{ .bytes = &b, .offset = std.math.maxInt(usize) };
    try t.expectError(error.UnexpectedEnd, color.Color.read(&r));
    try t.expectEqual(std.math.maxInt(usize), r.offset);
}
test "color effect kinds preserve unknown integers and read failures preserve cursor" {
    for (0..28) |i| {
        const e: effect.Effect = .{ .kind_raw = @intCast(i), .value_bits = 0x3f800000 };
        try t.expectEqual(i, @as(usize, @intCast(@intFromEnum(e.kind().?))));
        try t.expectEqual(@as(f32, 1), e.value());
    }
    for ([_]i32{ -2147483648, -1, 28, 2147483647 }) |kind| {
        const e: effect.Effect = .{ .kind_raw = kind, .value_bits = 0 };
        try t.expect(e.kind() == null);
    }
    const b = [_]u8{0} ** 8;
    var r: Reader = .{ .bytes = &b, .offset = 1 };
    try t.expectError(error.UnexpectedEnd, effect.Effect.read(&r));
    try t.expectEqual(1, r.offset);
}

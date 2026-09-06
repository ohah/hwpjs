const std = @import("std");
const t = std.testing;
const d = @import("reader.zig");
const Version = @import("../version.zig").Version;
const modern: Version = .{ .raw = 0x05010001 };
fn put(bytes: []u8, offset: usize, comptime T: type, value: T) void {
    std.mem.writeInt(T, bytes[offset..][0..@sizeOf(T)], value, .little);
}
test "char shape language arrays, signed values and versioned absence" {
    var b = [_]u8{0} ** 75;
    for (0..7) |i| {
        put(&b, i * 2, u16, @intCast(i + 100));
        b[14 + i] = @intCast(90 + i);
        b[21 + i] = @bitCast(@as(i8, @intCast(i)) - 7);
        b[28 + i] = @intCast(110 + i);
        b[35 + i] = @bitCast(@as(i8, @intCast(i)) - 100);
    }
    put(&b, 42, i32, -2147483648);
    put(&b, 46, u32, 0xffffffff);
    b[50] = 128;
    b[51] = 127;
    put(&b, 52, u32, 0x12345678);
    put(&b, 56, u32, 0x87654321);
    put(&b, 60, u32, 0x10203040);
    put(&b, 64, u32, 0x50607080);
    put(&b, 68, u16, 0x1234);
    put(&b, 70, u32, 0xaabbccdd);
    b[74] = 0xee;
    const v = try d.CharShape.parse(&b, modern);
    for (0..7) |i| {
        try t.expectEqual(i + 100, v.font_ids[i]);
        try t.expectEqual(@as(i8, @intCast(i)) - 7, v.spacing[i]);
        try t.expectEqual(@as(i8, @intCast(i)) - 100, v.offsets[i]);
    }
    try t.expectEqual(-2147483648, v.size);
    try t.expectEqual(-128, v.shadow_x);
    try t.expectEqual(127, v.shadow_y);
    try t.expectEqual(0x12345678, v.text_color);
    try t.expectEqual(0x87654321, v.underline_color);
    try t.expectEqual(0x1234, v.border_fill_id.?);
    try t.expectEqual(0xaabbccdd, v.strike_color.?);
    try t.expectEqualSlices(u8, &.{0xee}, v.extra);
    for (0..74) |n| {
        if (n == 68 or n == 70) continue;
        try t.expectError(error.UnexpectedEnd, d.CharShape.parse(b[0..n], modern));
    }
    const absent = try d.CharShape.parse(b[0..68], modern);
    try t.expect(absent.border_fill_id == null and absent.strike_color == null);
    const old = try d.CharShape.parse(&b, .{ .raw = 0x05000200 });
    try t.expect(old.border_fill_id == null and old.strike_color == null);
    try t.expectEqual(7, old.extra.len);
    const middle = try d.CharShape.parse(&b, .{ .raw = 0x05000201 });
    try t.expectEqual(0x1234, middle.border_fill_id.?);
    try t.expect(middle.strike_color == null);
}
test "para shape single indent, separate old/new spacing, level and tails" {
    var b = [_]u8{0} ** 59;
    put(&b, 12, i32, -720);
    put(&b, 16, i32, 11);
    put(&b, 20, i32, 22);
    put(&b, 24, i32, 160);
    put(&b, 28, u16, 1);
    put(&b, 30, u16, 2);
    put(&b, 32, u16, 3);
    put(&b, 34, i16, -32768);
    put(&b, 36, i16, 32767);
    put(&b, 42, u32, 0x1234);
    put(&b, 46, u32, 3);
    put(&b, 50, i32, 240);
    put(&b, 54, u32, 9);
    b[58] = 0xee;
    const v = try d.ParaShape.parse(&b, modern);
    try t.expectEqual(-720, v.indent);
    try t.expectEqual(11, v.before);
    try t.expectEqual(22, v.after);
    try t.expectEqual(160, v.legacy_spacing);
    try t.expectEqual(240, v.modern_spacing.?.value);
    try t.expectEqual(1, v.tab_def_id);
    try t.expectEqual(2, v.head_id);
    try t.expectEqual(3, v.border_fill_id);
    try t.expectEqual(-32768, v.border_spacing[0]);
    try t.expectEqual(32767, v.border_spacing[1]);
    try t.expectEqual(9, v.level.?);
    try t.expectEqualSlices(u8, &.{0xee}, v.extra);
    for (0..58) |n| {
        if (n == 42 or n == 46 or n == 54) continue;
        try t.expectError(error.UnexpectedEnd, d.ParaShape.parse(b[0..n], modern));
    }
    const old = try d.ParaShape.parse(&b, .{ .raw = 0x05000106 });
    try t.expect(old.attributes2 == null);
    try t.expectEqual(17, old.extra.len);
    const middle = try d.ParaShape.parse(&b, .{ .raw = 0x05000204 });
    try t.expect(middle.modern_spacing == null);
    const newer = try d.ParaShape.parse(&b, .{ .raw = 0x05000205 });
    try t.expect(newer.modern_spacing != null and newer.level == null);
}
test "border fill interleaving, all brushes, gradient counts and extension bounds" {
    var b = [_]u8{0} ** 105;
    for (0..5) |i| {
        b[2 + i * 6] = @intCast(i + 1);
        b[3 + i * 6] = @intCast(i + 8);
        put(&b, 4 + i * 6, u32, @intCast(i + 1000));
    }
    put(&b, 32, u32, 7);
    put(&b, 36, u32, 0x12345678);
    put(&b, 40, u32, 0xabcdef01);
    put(&b, 44, i32, -1);
    b[48] = 4;
    put(&b, 49, u32, 90);
    put(&b, 53, u32, 20);
    put(&b, 57, u32, 30);
    put(&b, 61, u32, 40);
    put(&b, 65, u32, 3);
    put(&b, 69, i32, -1);
    put(&b, 73, i32, 50);
    put(&b, 77, i32, 100);
    put(&b, 81, u32, 1);
    put(&b, 85, u32, 2);
    put(&b, 89, u32, 3);
    b[93] = 5;
    b[94] = 246;
    b[95] = 20;
    b[96] = 3;
    put(&b, 97, u16, 0x1234);
    put(&b, 99, u32, 1);
    b[103] = 50;
    b[104] = 0xee;
    for (0..104) |n| try t.expectError(error.UnexpectedEnd, d.BorderFill.parse(b[0..n]));
    const v = try d.BorderFill.parse(&b);
    for (v.borders, 0..) |border, i| {
        try t.expectEqual(i + 1, border.kind);
        try t.expectEqual(i + 8, border.width);
        try t.expectEqual(i + 1000, border.color);
    }
    const k = v.fill.data.known;
    try t.expectEqual(-1, k.pattern.?.kind);
    try t.expectEqual(0x12345678, k.pattern.?.background);
    const g = k.gradient.?;
    try t.expectEqual(3, g.count());
    try t.expectEqual(90, g.angle);
    try t.expectEqual(20, g.center_x);
    try t.expectEqual(30, g.center_y);
    try t.expectEqual(40, g.blur);
    try t.expectEqualSlices(u8, b[69..81], g.positions);
    try t.expectEqualSlices(u8, b[81..93], g.colors);
    try t.expectEqual(-1, g.position(0).?);
    try t.expectEqual(3, g.color(2).?);
    try t.expect(g.position(3) == null and g.color(std.math.maxInt(usize)) == null);
    try t.expectEqual(50, k.blurCenter().?);
    try t.expectEqual(-10, k.image.?.picture.contrast);
    try t.expectEqual(20, k.image.?.picture.brightness);
    try t.expectEqual(0x1234, k.image.?.picture.bin_data_id);
    try t.expectEqualSlices(u8, &.{50}, k.additional);
    try t.expectEqualSlices(u8, &.{0xee}, k.extra);
    put(&b, 65, u32, 0xffffffff);
    try t.expectError(error.UnexpectedEnd, d.BorderFill.parse(&b));
    put(&b, 32, u32, 0x80000007);
    const unknown = try d.BorderFill.parse(&b);
    try t.expectEqualSlices(u8, b[36..], unknown.fill.data.unknown);
}
test "shape dispatch malformed payload never advances framing" {
    for ([_]u10{ 20, 21, 25 }) |tag| {
        var b: [4]u8 = undefined;
        put(&b, 0, u32, @as(u32, tag) | 1024);
        var it = try d.Iterator.init(&b, modern, .{});
        for (0..2) |_| {
            try t.expectError(error.UnexpectedEnd, it.next());
            try t.expectEqual(0, it.records.reader.offset);
            try t.expectEqual(0, it.records.count);
        }
    }
}

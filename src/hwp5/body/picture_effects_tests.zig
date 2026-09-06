const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const effects = @import("picture_effects.zig");
test "every named fixed effect field has an independent positional expectation" {
    var b: [56]u8 = undefined;
    for (0..14) |i| std.mem.writeInt(u32, b[i * 4 ..][0..4], @intCast(i + 1), .little);
    var r: Reader = .{ .bytes = &b };
    try t.expectEqualDeep(effects.fields.Shadow{
        .style = 1,
        .transparency_bits = 2,
        .blur_bits = 3,
        .direction_bits = 4,
        .distance_bits = 5,
        .alignment = 6,
        .skew_x_bits = 7,
        .skew_y_bits = 8,
        .scale_x_bits = 9,
        .scale_y_bits = 10,
        .rotate_with_shape = 11,
    }, try effects.fields.read(effects.fields.Shadow, &r));
    try t.expectEqual(44, r.offset);
    r.offset = 0;
    try t.expectEqualDeep(effects.fields.Neon{ .transparency_bits = 1, .radius_bits = 2 }, try effects.fields.read(effects.fields.Neon, &r));
    try t.expectEqual(8, r.offset);
    r.offset = 0;
    try t.expectEqualDeep(effects.fields.Reflection{
        .style = 1,
        .radius_bits = 2,
        .direction_bits = 3,
        .distance_bits = 4,
        .skew_x_bits = 5,
        .skew_y_bits = 6,
        .scale_x_bits = 7,
        .scale_y_bits = 8,
        .rotation_style = 9,
        .start_transparency_bits = 10,
        .start_position_bits = 11,
        .end_transparency_bits = 12,
        .end_position_bits = 13,
        .offset_direction_bits = 14,
    }, try effects.fields.read(effects.fields.Reflection, &r));
    try t.expectEqual(56, r.offset);
    r = .{ .bytes = b[0..8], .offset = 1 };
    try t.expectError(error.UnexpectedEnd, effects.fields.read(effects.fields.Neon, &r));
    try t.expectEqual(1, r.offset);
}
test "picture effects compose all blocks atomically and leave additional properties" {
    var b = [_]u8{0} ** 142;
    std.mem.writeInt(u32, b[1..5], 15, .little);
    // flags4 + shadow(44+12) + neon(8+12) + soft4 + reflection56 = 140.
    std.mem.writeInt(i32, b[5..9], -123, .little);
    std.mem.writeInt(u32, b[9..13], 0x7fc12345, .little);
    std.mem.writeInt(i32, b[45..49], -1, .little);
    std.mem.writeInt(u32, b[61..65], 0xff800000, .little);
    std.mem.writeInt(u32, b[81..85], 0x80000000, .little);
    std.mem.writeInt(i32, b[85..89], -77, .little);
    std.mem.writeInt(i32, b[117..121], -88, .little);
    std.mem.writeInt(u32, b[137..141], 0x7f812345, .little);
    var r: Reader = .{ .bytes = &b, .offset = 1 };
    const p = try effects.Effects.read(&r);
    try t.expectEqual(141, r.offset);
    try t.expectEqual(-123, p.shadow.?.properties.style);
    try t.expectEqual(-1, p.shadow.?.properties.rotate_with_shape);
    try t.expectEqual(@as(u32, 0x7fc12345), p.shadow.?.properties.transparency_bits);
    try t.expectEqual(@as(u32, 0xff800000), p.neon.?.properties.transparency_bits);
    try t.expectEqual(@as(u32, 0x80000000), p.soft_edge_radius_bits.?);
    try t.expectEqual(-77, p.reflection.?.style);
    try t.expectEqual(-88, p.reflection.?.rotation_style);
    try t.expectEqual(@as(u32, 0x7f812345), p.reflection.?.offset_direction_bits);
    for (1..141) |cut| {
        r = .{ .bytes = b[0..cut], .offset = 1 };
        try t.expectError(error.UnexpectedEnd, effects.Effects.read(&r));
        try t.expectEqual(1, r.offset);
    }
    b[1] = 31;
    r = .{ .bytes = &b, .offset = 1 };
    try t.expectError(error.UnsupportedPictureEffects, effects.Effects.read(&r));
    try t.expectEqual(1, r.offset);
    b[1] = 15;
    b[49] = 1;
    try t.expectError(error.UnsupportedPictureColorType, effects.Effects.read(&r));
    try t.expectEqual(1, r.offset);
    b[49] = 0;
    b[77] = 255; // second color's array count
    try t.expectError(error.UnexpectedEnd, effects.Effects.read(&r));
    try t.expectEqual(1, r.offset);
    r = .{ .bytes = &.{ 0, 0, 0, 0, 99 } };
    const none = try effects.Effects.read(&r);
    try t.expectEqual(4, r.offset);
    try t.expect(none.shadow == null and none.neon == null and none.soft_edge_radius_bits == null and none.reflection == null);
}

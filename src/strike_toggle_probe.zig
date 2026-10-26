const std = @import("std");
const strike = @import("hwp5/edit/character_strike_payload.zig");
const compat = @import("hwp5/edit/character_decoration_compat.zig");

test "HWP5 legacy strike permits byte identical underline color without changing decoration" {
    const a = std.testing.allocator;
    const writer = @import("hwp5/edit/character_property_payload.zig");
    var source: [68]u8 = @splat(0);
    std.mem.writeInt(u32, source[46..50], 2 << 2, .little);
    std.mem.writeInt(u32, source[56..60], 0x563412, .little);
    const output = try writer.write(a, &source, .{ .raw = 0x05000107 }, .{ .underline_color = 0x123456 }, 68);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, &source, output);
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, writer.write(a, &source, .{ .raw = 0x05000107 }, .{ .underline_color = 0x654321 }, 68));
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, writer.write(a, &source, .{ .raw = 0x05000107 }, .{ .underline_color = 0x123456, .underline_kind = .bottom }, 68));
}

test "HWP5 disable strike cannot resurrect legacy strike from modern plus center bits" {
    for (0..4) |underline| for (0..2) |kind| {
        const raw: u32 = 0xa5a55a5a & ~@as(u32, 3 << 2 | 7 << 18) | @as(u32, @intCast(underline)) << 2 | @as(u32, @intCast(kind)) << 18;
        const off = try strike.attributes(raw, false);
        const expected = raw & ~(@as(u32, 7 << 18) | (if (underline == 2) @as(u32, 3 << 2) else 0));
        try std.testing.expectEqual(expected, off);
        try std.testing.expectEqual(@as(?bool, false), compat.resolve(.{
            .underline_kind_raw = @as(u2, @truncate(off >> 2)),
            .strike_kind_raw = @as(u3, @truncate(off >> 18)),
            .underline_style_raw = @as(u4, 1),
            .underline_color_raw = @as(u32, 0),
            .strike_style_raw = @as(u4, 1),
            .strike_color_raw = @as(?u32, 0),
        }).strike_enabled);
    };
}

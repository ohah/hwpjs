const std = @import("std");
const t = std.testing;
const picture = @import("shape_picture.zig");
test "picture explicit prefixes preserve fields, absent versus zero, and borrowed tails" {
    var b = [_]u8{0} ** 81;
    std.mem.writeInt(u32, b[0..4], 0xff102030, .little);
    std.mem.writeInt(i32, b[4..8], -123, .little);
    std.mem.writeInt(u32, b[8..12], 0xffffffff, .little);
    for (0..8) |i| std.mem.writeInt(i32, b[12 + i * 4 ..][0..4], @as(i32, @intCast(i)) * 17 - 53, .little);
    std.mem.writeInt(i32, b[44..48], std.math.minInt(i32), .little);
    std.mem.writeInt(i16, b[60..62], -32768, .little);
    b[68] = 206; // contrast -50
    b[69] = 70; // brightness
    b[70] = 255;
    std.mem.writeInt(u16, b[71..73], 65535, .little);
    b[78..81].* = .{ 255, 128, 7 };
    for ([_]picture.Layout{ .separate_axes, .interleaved }) |layout| {
        for ([_]picture.Prefix{ .base73, .with_opacity74, .with_instance78 }, [_]usize{ 73, 74, 78 }) |prefix, size| {
            const p = try picture.Picture.parse(&b, layout, prefix);
            try t.expectEqual(@as(u32, 0xff102030), p.border_color);
            try t.expectEqual(-123, p.border_width);
            try t.expectEqual(@as(u32, 0xffffffff), p.borderAttributes().raw);
            try t.expectEqual(-53, p.points.get(0).?.x);
            try t.expectEqual(@as(i32, if (layout == .separate_axes) 15 else -36), p.points.get(0).?.y);
            try t.expectEqual(std.math.minInt(i32), p.crop[0]);
            try t.expectEqual(-32768, p.margins[0]);
            try t.expectEqual(-50, p.image.contrast);
            try t.expectEqual(70, p.image.brightness);
            try t.expectEqual(255, p.image.effect);
            try t.expectEqual(65535, p.image.bin_data_id);
            try t.expectEqual(@as(?u8, if (prefix == .base73) null else 0), p.border_opacity);
            try t.expectEqual(@as(?u32, if (prefix == .with_instance78) 0 else null), p.instance_id);
            try t.expectEqual(@intFromPtr(b[size..].ptr), @intFromPtr(p.extra.ptr));
            try t.expectEqual(@intFromPtr(b[12..].ptr), @intFromPtr(p.points.raw.ptr));
            for (0..size) |cut| try t.expectError(error.UnexpectedEnd, picture.Picture.parse(b[0..cut], layout, prefix));
            const exact = try picture.Picture.parse(b[0..size], layout, prefix);
            try t.expectEqual(0, exact.extra.len);
        }
    }
}

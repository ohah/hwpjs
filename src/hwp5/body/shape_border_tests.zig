const std = @import("std");
const t = std.testing;
const border = @import("shape_border.zig");
test "line attributes isolate every raw bit without enum normalization" {
    for (0..32) |bit| {
        const raw = @as(u32, 1) << @intCast(bit);
        const a: border.Attributes = .{ .raw = raw };
        try t.expectEqual(raw & 63, a.lineType());
        try t.expectEqual((raw >> 6) & 15, a.lineEnd());
        try t.expectEqual((raw >> 10) & 63, a.startArrow());
        try t.expectEqual((raw >> 16) & 63, a.endArrow());
        try t.expectEqual((raw >> 22) & 15, a.startSize());
        try t.expectEqual((raw >> 26) & 15, a.endSize());
        try t.expectEqual(bit == 30, a.startFilled());
        try t.expectEqual(bit == 31, a.endFilled());
    }
    const a: border.Attributes = .{ .raw = 0xffffffff };
    try t.expectEqual(63, a.startArrow());
    try t.expectEqual(15, a.endSize());
}
test "border widths are explicit and failed reads leave cursor untouched" {
    inline for (.{ border.Layout.spec11, border.Layout.observed13 }) |layout| {
        const width = if (layout == .spec11) 11 else 13;
        var raw = [_]u8{255} ** (width + 1);
        if (layout == .spec11) std.mem.writeInt(i16, raw[4..6], -32768, .little) else std.mem.writeInt(i32, raw[4..8], -2147483648, .little);
        const p = try border.Border.parse(&raw, layout);
        try t.expectEqual(if (layout == .spec11) @as(i32, -32768) else -2147483648, p.value.width);
        try t.expectEqual(0xffffffff, p.value.color);
        try t.expectEqual(0xffffffff, p.value.attributes.raw);
        try t.expectEqual(255, p.value.outline);
        try t.expectEqualSlices(u8, &.{255}, p.extra);
        for (0..width) |n| {
            var r: @import("../../binary/reader.zig").Reader = .{ .bytes = raw[0..n] };
            try t.expectError(error.UnexpectedEnd, border.Border.read(&r, layout));
            try t.expectEqual(0, r.offset);
        }
    }
}

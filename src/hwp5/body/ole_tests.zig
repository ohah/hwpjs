const std = @import("std");
const t = std.testing;
const ole = @import("ole.zig");
test "OLE layouts preserve signed fields and separate BinData from border color" {
    inline for (.{ ole.Layout.spec24, ole.Layout.observed26 }) |layout| {
        const width = if (layout == .spec24) 2 else 4;
        var raw = [_]u8{0xff} ** (width + 23);
        std.mem.writeInt(i32, raw[width..][0..4], -2147483648, .little);
        std.mem.writeInt(i32, raw[width + 4 ..][0..4], 2147483647, .little);
        std.mem.writeInt(u16, raw[width + 8 ..][0..2], 1, .little);
        std.mem.writeInt(u32, raw[width + 10 ..][0..4], 0x12345678, .little);
        const p = try ole.Properties.parse(&raw, layout);
        try t.expectEqual(-2147483648, p.extent_x);
        try t.expectEqual(2147483647, p.extent_y);
        try t.expectEqual(1, p.bin_data_id);
        try t.expectEqual(0x12345678, p.border_color);
        try t.expectEqual(-1, p.border_thickness);
        try t.expectEqual(0xffffffff, p.border_attributes);
        try t.expectEqual(255, p.drawingAspect());
        try t.expect(p.hasMoniker());
        try t.expectEqual(127, p.baselineRaw());
        if (layout == .spec24) try t.expectEqual(null, p.objectKind()) else try t.expectEqual(63, p.objectKind().?);
        try t.expectEqualSlices(u8, &.{255}, p.extra);
        for (0..width + 22) |n| try t.expectError(error.UnexpectedEnd, ole.Properties.parse(raw[0..n], layout));
        @memset(&raw, 0);
        const zero = try ole.Properties.parse(&raw, layout);
        try t.expect(!zero.hasMoniker());
        try t.expectEqual(0, zero.baselineRaw());
        try t.expectEqual(0, zero.bin_data_id);
    }
}

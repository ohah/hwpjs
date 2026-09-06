const std = @import("std");
const t = std.testing;
const g = @import("group_info.zig");
test "group child IDs preserve order duplicates unknown values and optional instance" {
    var b = [_]u8{0} ** 22;
    std.mem.writeInt(u16, b[0..2], 3, .little);
    for ([_]u32{ 0x24726563, 0xffffffff, 0x24726563 }, 0..) |id, i| std.mem.writeInt(u32, b[2 + i * 4 ..][0..4], id, .little);
    std.mem.writeInt(u32, b[14..18], 0x80000001, .little);
    @memcpy(b[18..], &[_]u8{ 9, 0, 128, 255 });
    for ([_]g.Layout{ .ids_only, .with_instance }) |layout| {
        const p = try g.Info.parse(&b, layout);
        try t.expectEqual(3, p.ids.count());
        try t.expectEqual(0x24726563, p.ids.get(0).?.id);
        try t.expectEqual(0xffffffff, p.ids.get(1).?.id);
        try t.expectEqual(0x24726563, p.ids.get(2).?.id);
        try t.expectEqual(null, p.ids.get(3));
        try t.expectEqual(b[2..].ptr, p.ids.raw.ptr);
        try t.expectEqual(@as(?u32, if (layout == .with_instance) 0x80000001 else null), p.instance_id);
        const end: usize = if (layout == .with_instance) 18 else 14;
        try t.expectEqualSlices(u8, b[end..], p.extra);
        for (0..end) |cut| try t.expectError(error.UnexpectedEnd, g.Info.parse(b[0..cut], layout));
    }
    b[0] = 0;
    try t.expectEqual(0, (try g.Info.parse(b[0..2], .ids_only)).ids.count());
    try t.expectEqual(null, (try g.Info.parse(b[0..2], .ids_only)).instance_id);
    @memset(b[2..6], 0);
    try t.expectEqual(@as(?u32, 0), (try g.Info.parse(b[0..6], .with_instance)).instance_id);
    @memset(b[0..2], 255);
    try t.expectError(error.UnexpectedEnd, g.Info.parse(&b, .ids_only));
}

const std = @import("std");
const t = std.testing;
const arc = @import("shape_arc.zig");
test "arc layouts retain distinct header width, signed points and borrowed extra" {
    for ([_]arc.Layout{ .specified_u32, .reference_u8 }) |layout| {
        var b = [_]u8{0} ** 31;
        const start: usize = if (layout == .specified_u32) 4 else 1;
        @memset(b[0..start], 255);
        const coordinates = [_]i32{ std.math.minInt(i32), 19, -73, std.math.maxInt(i32), 0, -1 };
        for (coordinates, 0..) |value, i| std.mem.writeInt(i32, b[start + i * 4 ..][0..4], value, .little);
        const end = start + 24;
        @memcpy(b[end..][0..3], &[_]u8{ 0, 128, 255 });
        const p = try arc.Arc.parse(b[0 .. end + 3], layout);
        try t.expectEqual(layout, std.meta.activeTag(p.header));
        try t.expectEqual(@as(u32, if (layout == .specified_u32) 0xffffffff else 255), p.headerRaw());
        try t.expectEqualDeep(arc.Point{ .x = coordinates[0], .y = coordinates[1] }, p.center);
        try t.expectEqualDeep(arc.Point{ .x = coordinates[2], .y = coordinates[3] }, p.axis1);
        try t.expectEqualDeep(arc.Point{ .x = coordinates[4], .y = coordinates[5] }, p.axis2);
        try t.expectEqualSlices(u8, &.{ 0, 128, 255 }, p.extra);
        try t.expectEqual(b[end..].ptr, p.extra.ptr);
        for (0..end) |n| try t.expectError(error.UnexpectedEnd, arc.Arc.parse(b[0..n], layout));
        try t.expectEqual(0, (try arc.Arc.parse(b[0..end], layout)).extra.len);
    }
}
test "arc never guesses layout from a padded reference payload" {
    var b: [28]u8 = undefined;
    for (&b, 0..) |*v, i| v.* = @intCast(i + 1);
    const specified = try arc.Arc.parse(&b, .specified_u32);
    const reference = try arc.Arc.parse(&b, .reference_u8);
    try t.expectEqual(0x04030201, specified.headerRaw());
    try t.expectEqual(1, reference.headerRaw());
    try t.expect(specified.center.x != reference.center.x);
    try t.expectEqualSlices(u8, b[25..28], reference.extra);
    try t.expectEqual(0, specified.extra.len);
}

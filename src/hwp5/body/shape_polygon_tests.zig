const std = @import("std");
const t = std.testing;
const polygon = @import("shape_polygon.zig");
const points = @import("shape_points.zig");
test "polygon preserves layout, signed point order, empty counts and opaque tails" {
    const expected = [_]points.Point{ .{ .x = std.math.minInt(i32), .y = 17 }, .{ .x = -1, .y = std.math.maxInt(i32) }, .{ .x = 19, .y = -73 } };
    for ([_]polygon.Layout{ .specified_i16_axes, .observed_i32_points }) |layout| {
        var b = [_]u8{0} ** 32;
        const start: usize = if (layout == .specified_i16_axes) 2 else 4;
        b[0] = 3;
        for (expected, 0..) |p, i| {
            const x = start + 4 * (if (start == 2) i else i * 2);
            const y = start + 4 * (if (start == 2) i + 3 else i * 2 + 1);
            std.mem.writeInt(i32, b[x..][0..4], p.x, .little);
            std.mem.writeInt(i32, b[y..][0..4], p.y, .little);
        }
        @memcpy(b[start + 24 ..][0..4], &[_]u8{ 0, 128, 254, 255 });
        const p = try polygon.Polygon.parse(b[0 .. start + 28], layout);
        try t.expectEqual(3, p.points.count());
        for (expected, 0..) |point, i| try t.expectEqualDeep(point, p.points.get(i).?);
        try t.expectEqual(null, p.points.get(3));
        try t.expectEqual(null, p.points.get(std.math.maxInt(usize)));
        try t.expectEqual(b[start..].ptr, p.points.raw.ptr);
        try t.expectEqualSlices(u8, b[start + 24 ..][0..4], p.extra);
        for (0..start + 24) |n| try t.expectError(error.UnexpectedEnd, polygon.Polygon.parse(b[0..n], layout));
        for (0..5) |n| try t.expectEqual(n, (try polygon.Polygon.parse(b[0 .. start + 24 + n], layout)).extra.len);
        @memset(b[0..start], 0);
        const empty = try polygon.Polygon.parse(b[0 .. start + 4], layout);
        try t.expectEqual(0, empty.points.count());
        try t.expectEqual(4, empty.extra.len);
        @memset(b[0..start], 255);
        try t.expectError(error.NegativePointCount, polygon.Polygon.parse(&b, layout));
        b[start - 1] = 127;
        try t.expectError(error.UnexpectedEnd, polygon.Polygon.parse(&b, layout));
    }
}
test "counted points reject impossible sizes before multiplying and preserve reader position" {
    for ([_]points.Layout{ .separate_axes, .interleaved }) |layout| {
        var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &.{ 0, 1, 2, 3, 4, 5, 6, 7 }, .offset = 1 };
        try t.expectError(error.UnexpectedEnd, points.Points.read(&r, std.math.maxInt(usize), layout));
        try t.expectEqual(1, r.offset);
        try t.expectError(error.UnexpectedEnd, points.Points.read(&r, 1, layout));
        try t.expectEqual(1, r.offset);
        try t.expectEqual(0, (try points.Points.read(&r, 0, layout)).count());
        try t.expectEqual(1, r.offset);
        r.offset = std.math.maxInt(usize);
        try t.expectError(error.UnexpectedEnd, points.Points.read(&r, 0, layout));
        try t.expectEqual(std.math.maxInt(usize), r.offset);
    }
}

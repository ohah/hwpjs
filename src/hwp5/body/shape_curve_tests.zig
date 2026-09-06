const std = @import("std");
const t = std.testing;
const curve = @import("shape_curve.zig");
test "curve requires every segment and preserves signed points, unknown types and opaque tail" {
    for ([_]curve.Layout{ .specified_i16_axes, .observed_i32_points }) |layout| {
        var b = [_]u8{0} ** 34;
        const start: usize = if (layout == .specified_i16_axes) 2 else 4;
        b[0] = 3;
        const xy = [_]i32{ std.math.minInt(i32), 19, -73, std.math.maxInt(i32), 0, -1 };
        for (0..3) |i| {
            const x = start + 4 * (if (start == 2) i else i * 2);
            const y = start + 4 * (if (start == 2) i + 3 else i * 2 + 1);
            std.mem.writeInt(i32, b[x..][0..4], xy[i * 2], .little);
            std.mem.writeInt(i32, b[y..][0..4], xy[i * 2 + 1], .little);
        }
        b[start + 24] = 1;
        b[start + 25] = 255;
        @memcpy(b[start + 26 ..][0..4], &[_]u8{ 9, 0, 128, 255 });
        const p = try curve.Curve.parse(b[0 .. start + 30], layout);
        for (0..3) |i| {
            try t.expectEqual(xy[i * 2], p.points.get(i).?.x);
            try t.expectEqual(xy[i * 2 + 1], p.points.get(i).?.y);
        }
        try t.expectEqualSlices(u8, &.{ 1, 255 }, p.segments);
        try t.expectEqual(b[start + 24 ..].ptr, p.segments.ptr);
        try t.expectEqualSlices(u8, &.{ 9, 0, 128, 255 }, p.extra);
        try t.expectEqual(b[start + 26 ..].ptr, p.extra.ptr);
        for (0..start + 26) |n| try t.expectError(error.UnexpectedEnd, curve.Curve.parse(b[0..n], layout));
        for (0..5) |n| try t.expectEqual(n, (try curve.Curve.parse(b[0 .. start + 26 + n], layout)).extra.len);
    }
}
test "empty and single-point curves have no segments; counted reads fail atomically" {
    for ([_]curve.Layout{ .specified_i16_axes, .observed_i32_points }) |layout| {
        var b = [_]u8{0} ** 12;
        const width: usize = if (layout == .specified_i16_axes) 2 else 4;
        try t.expectEqual(0, (try curve.Curve.parse(b[0..width], layout)).segments.len);
        b[0] = 1;
        const p = try curve.Curve.parse(b[0 .. width + 8], layout);
        try t.expectEqual(1, p.points.count());
        try t.expectEqual(0, p.segments.len);
        var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &b, .offset = 1 };
        @memset(b[1 .. 1 + width], 255);
        try t.expectError(error.NegativePointCount, curve.Points.readCounted(&r, layout));
        try t.expectEqual(1, r.offset);
        @memset(b[1 .. 1 + width], 0);
        b[1] = 2;
        try t.expectError(error.UnexpectedEnd, curve.Points.readCounted(&r, layout));
        try t.expectEqual(1, r.offset);
    }
}

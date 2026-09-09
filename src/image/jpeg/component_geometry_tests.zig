const std = @import("std");
const t = std.testing;
const Geometry = @import("component_geometry.zig").Geometry;
const Extent = @import("component_geometry.zig").Extent;
const parse = @import("frame.zig").parse;

test "JPEG component geometry uses all frame sampling factors and resolved height" {
    var raw = [_]u8{ 8, 0, 0, 0, 1, 2, 7, 17, 0, 9, 68, 0 };
    for (1..5) |h| for (1..5) |v| {
        raw[7] = @intCast(h * 16 + v);
        for (1..65536) |width| {
            std.mem.writeInt(u16, raw[3..5], @intCast(width), .big);
            const frame = try parse(0xc0, &raw, .{});
            const geometry = try Geometry.init(frame, @intCast(65536 - width));
            const c = geometry.component(0).?;
            try t.expectEqual(@as(u32, @intCast((width * h + 3) / 4)), c.width);
            try t.expectEqual(@as(u32, @intCast(((65536 - width) * v + 3) / 4)), c.height);
            try t.expectEqual(@as(u64, c.width) * c.height, c.samples());
            const grid = c.blocks();
            try t.expectEqual(@as(u32, @intCast((width * h + 31) / 32)), grid.width);
            try t.expectEqual(@as(u32, @intCast(((65536 - width) * v + 31) / 32)), grid.height);
        }
    };
    const frame = try parse(0xc0, &raw, .{});
    const geometry = try Geometry.init(frame, 1);
    try t.expect(geometry.component(2) == null);
    try t.expect(geometry.component(std.math.maxInt(usize)) == null);
    try t.expectError(error.MissingJpegDnl, Geometry.init(frame, 0));
    try t.expectError(error.UnsupportedJpegDctLayout, Geometry.init(try parse(0xc3, &raw, .{}), 1));
}

test "JPEG visible block extents partition the component without padded samples" {
    for (1..66) |width| for (1..66) |height| {
        const extent: Extent = .{ .width = @intCast(width), .height = @intCast(height) };
        const grid = extent.blocks();
        var count: u64 = 0;
        for (0..grid.height + 2) |y| for (0..grid.width + 2) |x| {
            const clipped = extent.clip(@intCast(x), @intCast(y));
            if (x * 8 >= width or y * 8 >= height) {
                try t.expect(clipped == null);
            } else {
                const part = clipped.?;
                try t.expectEqual(@min(8, width - x * 8), part.width);
                try t.expectEqual(@min(8, height - y * 8), part.height);
                count += part.samples();
            }
        };
        try t.expectEqual(width * height, count);
        try t.expect(extent.clip(std.math.maxInt(u32), 0) == null);
        try t.expect(extent.clip(0, std.math.maxInt(u32)) == null);
    };
}

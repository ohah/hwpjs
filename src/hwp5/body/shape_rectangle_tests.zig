const std = @import("std");
const t = std.testing;
const rect = @import("shape_rectangle.zig");
test "rectangle explicit layouts preserve signed distinct coordinates and raw rounding" {
    try t.expectEqual(79, rect.tag);
    var raw = [_]u8{0} ** 35;
    raw[0] = 255;
    raw[33] = 9;
    raw[34] = 128;
    const values = [_]i32{ -2147483648, 2147483647, -1, 0, 123, -456, 789, -1024 };
    for (values, 0..) |value, i| std.mem.writeInt(i32, raw[1 + i * 4 ..][0..4], value, .little);
    for ([_]rect.Layout{ .specified_axes, .observed_points }) |layout| {
        const p = try rect.Rectangle.parse(&raw, layout);
        try t.expectEqual(255, p.round_rate);
        for (p.points, 0..) |point, i| {
            try t.expectEqual(values[if (layout == .specified_axes) i else i * 2], point.x);
            try t.expectEqual(values[if (layout == .specified_axes) i + 4 else i * 2 + 1], point.y);
        }
        try t.expectEqualSlices(u8, &.{ 9, 128 }, p.extra);
        for (0..33) |n| try t.expectError(error.UnexpectedEnd, rect.Rectangle.parse(raw[0..n], layout));
    }
}
test "shared signed shape point read rolls back at every partial coordinate" {
    const Reader = @import("../../binary/reader.zig").Reader;
    const raw = [_]u8{0} ** 11;
    for (3..11) |end| {
        var r: Reader = .{ .bytes = raw[0..end], .offset = 3 };
        try t.expectError(error.UnexpectedEnd, rect.Point.read(&r));
        try t.expectEqual(3, r.offset);
    }
}

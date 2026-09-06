const std = @import("std");
const t = std.testing;
const Line = @import("shape_line.zig").Line;
test "line preserves signed endpoints and full UINT16 attributes without coercion" {
    try t.expectEqual(78, @import("shape_line.zig").tag);
    var raw = [_]u8{0} ** 21;
    std.mem.writeInt(i32, raw[0..4], -2147483648, .little);
    std.mem.writeInt(i32, raw[4..8], 2147483647, .little);
    std.mem.writeInt(i32, raw[8..12], -1, .little);
    std.mem.writeInt(i32, raw[12..16], 0, .little);
    raw[18..].* = .{ 9, 128, 255 };
    for ([_]u16{ 0, 1, 2, 128, 256, 32768, 65535 }) |attributes| {
        std.mem.writeInt(u16, raw[16..18], attributes, .little);
        const p = try Line.parse(&raw);
        try t.expectEqual(-2147483648, p.start_x);
        try t.expectEqual(2147483647, p.start_y);
        try t.expectEqual(-1, p.end_x);
        try t.expectEqual(0, p.end_y);
        try t.expectEqual(attributes, p.attributes);
        try t.expectEqualSlices(u8, raw[18..], p.extra);
        try t.expectEqual(raw[18..].ptr, p.extra.ptr);
    }
    for (0..18) |n| try t.expectError(error.UnexpectedEnd, Line.parse(raw[0..n]));
    try t.expectEqual(0, (try Line.parse(raw[0..18])).extra.len);
}

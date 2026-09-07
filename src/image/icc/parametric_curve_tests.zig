const std = @import("std");
const t = std.testing;
const para = @import("parametric_curve.zig");
test "parametric curves preserve signed ordered parameters and absence" {
    const counts = [_]usize{ 1, 3, 4, 5, 7 };
    const values = [_]i32{ 0, -1, 65536, std.math.minInt(i32), std.math.maxInt(i32), -65536, 7 };
    for (counts, 0..) |count, kind| {
        var bytes = [_]u8{0} ** 40;
        bytes[0..4].* = "para".*;
        bytes[9] = @intCast(kind);
        for (values[0..count], 0..) |value, i| std.mem.writeInt(i32, bytes[12 + i * 4 ..][0..4], value, .big);
        const result = try para.parse(bytes[0 .. 12 + count * 4]);
        @memset(&bytes, 255);
        try t.expectEqual(kind, @intFromEnum(result.function));
        for (0..7) |i| try t.expectEqual(if (i < count) @as(?i32, values[i]) else null, result.get(@enumFromInt(i)));
    }
}
test "parametric function u16 domain sizes and reserved fields" {
    var bytes = [_]u8{0} ** 41;
    bytes[0..4].* = "para".*;
    const counts = [_]usize{ 1, 3, 4, 5, 7 };
    for (0..65536) |kind| {
        std.mem.writeInt(u16, bytes[8..10], @intCast(kind), .big);
        if (kind > 4) {
            try t.expectError(error.UnsupportedIccParametricFunction, para.parse(bytes[0..16]));
        } else for (0..bytes.len + 1) |size| {
            if (size < 8) {
                try t.expectError(error.InvalidIccTagDataSize, para.parse(bytes[0..size]));
            } else if (size != 12 + counts[kind] * 4) {
                try t.expectError(error.InvalidIccParametricSize, para.parse(bytes[0..size]));
            } else _ = try para.parse(bytes[0..size]);
        }
    }
    @memset(bytes[8..10], 0);
    for ([_]usize{ 0, 1, 2, 3, 4, 5, 6, 7, 10, 11 }) |i| {
        const old = bytes[i];
        bytes[i] ^= 1;
        const expected = if (i < 4) error.InvalidIccParametricType else if (i < 8) error.InvalidIccTagReserved else error.InvalidIccParametricReserved;
        try t.expectError(expected, para.parse(bytes[0..16]));
        bytes[i] = old;
    }
    _ = try para.parse(bytes[0..16]);
}

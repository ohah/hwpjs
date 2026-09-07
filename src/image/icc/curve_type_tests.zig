const std = @import("std");
const t = std.testing;
const curve = @import("curve_type.zig");
test "curve count selects identity gamma and borrowed samples without conversion" {
    var bytes = [_]u8{0} ** 20;
    bytes[0..4].* = "curv".*;
    try t.expectEqual(curve.Curve.identity, try curve.parse(bytes[0..12]));
    bytes[11] = 1;
    for (0..65536) |raw| {
        std.mem.writeInt(u16, bytes[12..14], @intCast(raw), .big);
        try t.expectEqual(@as(u16, @intCast(raw)), (try curve.parse(bytes[0..14])).gamma);
    }
    bytes[11] = 4;
    bytes[12..20].* = .{ 0, 1, 0xab, 0xcd, 0xff, 0xff, 0, 0 };
    const samples = (try curve.parse(&bytes)).samples;
    for ([_]u16{ 1, 0xabcd, 65535, 0 }, 0..) |expected, i| try t.expectEqual(expected, try samples.at(i));
    bytes[13] = 9;
    try t.expectEqual(@as(u16, 9), try samples.at(0));
    try t.expectError(error.InvalidIccCurveIndex, samples.at(4));
    try t.expectError(error.InvalidIccCurveIndex, samples.at(std.math.maxInt(usize)));
}
test "curve exact counts reject padding truncation huge declarations and bad prefixes" {
    var bytes = [_]u8{0} ** 33;
    bytes[0..4].* = "curv".*;
    for ([_]u32{ 0, 1, 2, 3, 10, 0x7fffffff, 0x80000000, 0xffffffff }) |count| {
        std.mem.writeInt(u32, bytes[8..12], count, .big);
        for (0..bytes.len + 1) |len| {
            if (len < 8) {
                try t.expectError(error.InvalidIccTagDataSize, curve.parse(bytes[0..len]));
            } else if (len < 12 or (len - 12) % 2 != 0 or (len - 12) / 2 != count) {
                try t.expectError(error.InvalidIccCurveSize, curve.parse(bytes[0..len]));
            } else _ = try curve.parse(bytes[0..len]);
        }
    }
    @memset(bytes[8..12], 0);
    for (0..8) |index| {
        const original = bytes[index];
        bytes[index] ^= 1;
        if (index < 4) {
            try t.expectError(error.InvalidIccCurveType, curve.parse(bytes[0..12]));
        } else try t.expectError(error.InvalidIccTagReserved, curve.parse(bytes[0..12]));
        bytes[index] = original;
    }
    _ = try curve.parse(bytes[0..12]);
}

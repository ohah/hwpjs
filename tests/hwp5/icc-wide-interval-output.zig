const std = @import("std");
const Interval = @import("hwpjs").image.icc.linear_preimage.Interval;
pub fn write(out: *[136]u8, result: ?Interval) void {
    writeFor(256, out, result);
}
pub fn writeExtended(out: *[520]u8, result: ?@import("hwpjs").image.icc.linear_preimage.ExtendedInterval) void {
    writeFor(1024, out, result);
}
fn writeFor(comptime bits: u16, out: *[8 + bits / 2]u8, result: anytype) void {
    const width = bits / 8;
    const U = std.meta.Int(.unsigned, bits);
    @memset(out, 0);
    if (result) |interval| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(u32, out[4..8], @as(u32, @intFromBool(interval.start_included)) | (@as(u32, @intFromBool(interval.end_included)) << 1), .little);
        for ([_]U{ interval.start.numerator, interval.start.denominator, interval.end.numerator, interval.end.denominator }, 0..) |v, i| std.mem.writeInt(U, out[8 + i * width ..][0..width], v, .little);
    }
}

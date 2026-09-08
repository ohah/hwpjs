const std = @import("std");
const Interval = @import("hwpjs").image.icc.linear_preimage.Interval;
pub fn write(out: *[136]u8, result: ?Interval) void {
    @memset(out, 0);
    if (result) |interval| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(u32, out[4..8], @as(u32, @intFromBool(interval.start_included)) | (@as(u32, @intFromBool(interval.end_included)) << 1), .little);
        std.mem.writeInt(u256, out[8..40], interval.start.numerator, .little);
        std.mem.writeInt(u256, out[40..72], interval.start.denominator, .little);
        std.mem.writeInt(u256, out[72..104], interval.end.numerator, .little);
        std.mem.writeInt(u256, out[104..136], interval.end.denominator, .little);
    }
}

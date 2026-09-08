const std = @import("std");
const Interval = @import("hwpjs").image.icc.parametric_segments.Interval;
pub fn write(out: *[40]u8, value: Interval) void {
    std.mem.writeInt(u32, out[0..4], 1, .little);
    std.mem.writeInt(u64, out[4..12], value.start.numerator, .little);
    std.mem.writeInt(u64, out[12..20], value.start.denominator, .little);
    std.mem.writeInt(u64, out[20..28], value.end.numerator, .little);
    std.mem.writeInt(u64, out[28..36], value.end.denominator, .little);
    std.mem.writeInt(u32, out[36..40], @as(u32, @intFromBool(value.start_included)) | (@as(u32, @intFromBool(value.end_included)) << 1), .little);
}

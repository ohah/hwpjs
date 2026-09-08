const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[4..]);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.parametric_trend.inspect(128, curve),
        256 => try icc.parametric_trend.inspect(256, curve),
        512 => try icc.parametric_trend.inspect(512, curve),
        1024 => try icc.parametric_trend.inspect(1024, curve),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(result), .little);
    return out;
}

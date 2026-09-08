const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const target = icc.parametric_nearest.Target{ .numerator = std.mem.readInt(u128, bytes[4..20], .big), .denominator = std.mem.readInt(u128, bytes[20..36], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.parametric_nearest.select(128, curve, target),
        256 => try icc.parametric_nearest.select(256, curve, target),
        512 => try icc.parametric_nearest.select(512, curve, target),
        1024 => try icc.parametric_nearest.select(1024, curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    return @import("icc-parametric-nearest-output.zig").write(a, result);
}

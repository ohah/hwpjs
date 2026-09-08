const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const n = std.mem.readInt(u128, bytes[4..20], .big);
    const d = std.mem.readInt(u128, bytes[20..36], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.power_preimage.solve(128, curve, n, d),
        256 => try icc.power_preimage.solve(256, curve, n, d),
        512 => try icc.power_preimage.solve(512, curve, n, d),
        1024 => try icc.power_preimage.solve(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    return @import("icc-power-preimage-output.zig").write(a, result);
}

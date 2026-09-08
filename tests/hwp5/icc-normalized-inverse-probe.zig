const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 32) return error.InvalidProbeInput;
    const curve = try icc.curve_type.parse(bytes[32..]);
    const samples = switch (curve) {
        .samples => |v| v,
        else => return error.InvalidIccInverseSamples,
    };
    const result = try icc.sampled_inverse.invertNormalized(samples, std.mem.readInt(u128, bytes[0..16], .big), std.mem.readInt(u128, bytes[16..32], .big));
    const out = try a.alloc(u8, 64);
    std.mem.writeInt(u256, out[0..32], result.numerator, .little);
    std.mem.writeInt(u256, out[32..64], result.denominator, .little);
    return out;
}

const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 2) return error.InvalidProbeInput;
    const curve = try icc.curve_type.parse(bytes[2..]);
    const samples = switch (curve) {
        .samples => |s| s,
        else => return error.InvalidIccInverseSamples,
    };
    const result = try icc.sampled_inverse.invert(samples, std.mem.readInt(u16, bytes[0..2], .big));
    const out = try a.alloc(u8, 16);
    std.mem.writeInt(u64, out[0..8], result.numerator, .little);
    std.mem.writeInt(u64, out[8..16], result.denominator, .little);
    return out;
}

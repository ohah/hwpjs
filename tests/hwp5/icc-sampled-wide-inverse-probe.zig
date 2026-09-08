const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 128) return error.InvalidProbeInput;
    const curve = try icc.curve_type.parse(bytes[128..]);
    const samples = switch (curve) {
        .samples => |s| s,
        else => return error.InvalidIccInverseSamples,
    };
    const out_value = try icc.sampled_inverse.invertWide(samples, std.mem.readInt(u512, bytes[0..64], .big), std.mem.readInt(u512, bytes[64..128], .big));
    const out = try a.alloc(u8, 256);
    std.mem.writeInt(u1024, out[0..128], out_value.numerator, .little);
    std.mem.writeInt(u1024, out[128..256], out_value.denominator, .little);
    return out;
}

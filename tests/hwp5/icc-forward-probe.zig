const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 16) return error.InvalidProbeInput;
    const curve = try icc.curve_type.parse(bytes[16..]);
    const samples = switch (curve) {
        .samples => |s| s,
        else => return error.InvalidIccCurveSamples,
    };
    const result = try icc.sampled_forward.evaluate(samples, .{
        .numerator = std.mem.readInt(u64, bytes[0..8], .big),
        .denominator = std.mem.readInt(u64, bytes[8..16], .big),
    });
    const out = try a.alloc(u8, 16);
    std.mem.writeInt(u64, out[0..8], result.numerator, .little);
    std.mem.writeInt(u64, out[8..16], result.denominator, .little);
    return out;
}

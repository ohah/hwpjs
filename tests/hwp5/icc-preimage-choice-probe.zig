const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 132) return error.InvalidProbeInput;
    const flags = std.mem.readInt(u32, bytes[128..132], .big);
    if (flags > 3) return error.InvalidProbeInput;
    const result = try icc.preimage_choice.select(.{
        .start = .{ .numerator = std.mem.readInt(u256, bytes[0..32], .big), .denominator = std.mem.readInt(u256, bytes[32..64], .big) },
        .end = .{ .numerator = std.mem.readInt(u256, bytes[64..96], .big), .denominator = std.mem.readInt(u256, bytes[96..128], .big) },
        .start_included = flags & 1 != 0,
        .end_included = flags & 2 != 0,
    });
    const out = try a.alloc(u8, 64);
    std.mem.writeInt(u256, out[0..32], result.numerator, .little);
    std.mem.writeInt(u256, out[32..64], result.denominator, .little);
    return out;
}

const std = @import("std");
const api = @import("hwpjs").image.icc.gamma_wide_inverse;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 130) return error.InvalidProbeInput;
    const result = try api.invert(std.mem.readInt(u16, bytes[0..2], .big), .{
        .numerator = std.mem.readInt(u512, bytes[2..66], .big),
        .denominator = std.mem.readInt(u512, bytes[66..130], .big),
    });
    const out = try a.alloc(u8, 144);
    @memset(out, 0);
    switch (result) {
        .rational => |r| {
            std.mem.writeInt(u512, out[8..72], r.numerator, .little);
            std.mem.writeInt(u512, out[72..136], r.denominator, .little);
        },
        .power => |r| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            std.mem.writeInt(u32, out[4..8], @intFromBool(r.negative), .little);
            std.mem.writeInt(u512, out[8..72], r.numerator, .little);
            std.mem.writeInt(u512, out[72..136], r.denominator, .little);
            std.mem.writeInt(i32, out[136..140], r.exponent_numerator, .little);
            std.mem.writeInt(u32, out[140..144], r.exponent_denominator, .little);
        },
    }
    return out;
}

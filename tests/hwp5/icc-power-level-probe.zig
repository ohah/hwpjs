const std = @import("std");
const level = @import("hwpjs").image.icc.power_level;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 12) return error.InvalidProbeInput;
    const result = level.solve(std.mem.readInt(i32, bytes[0..4], .big), std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(i32, bytes[8..12], .big));
    const count = if (result == .finite) result.finite.count else 0;
    const out = try a.alloc(u8, 8 + 20 * count);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], if (result == .all_nonzero) 1 else 0, .little);
    std.mem.writeInt(u32, out[4..8], @intCast(count), .little);
    if (result == .finite) for (result.finite.roots[0..count], 0..) |root, i| {
        const slot = out[8 + 20 * i ..][0..20];
        switch (root) {
            .zero => {},
            .nonzero => |r| {
                std.mem.writeInt(i32, slot[0..4], if (r.negative) -1 else 1, .little);
                std.mem.writeInt(u64, slot[4..12], r.numerator, .little);
                std.mem.writeInt(i32, slot[12..16], r.exponent_numerator, .little);
                std.mem.writeInt(u32, slot[16..20], r.exponent_denominator, .little);
            },
        }
    };
    return out;
}

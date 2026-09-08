const std = @import("std");
const level = @import("hwpjs").image.icc.normalized_power_level;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 40) return error.InvalidProbeInput;
    const result = try level.solve(std.mem.readInt(i32, bytes[0..4], .big), std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(u128, bytes[8..24], .big), std.mem.readInt(u128, bytes[24..40], .big));
    const count = if (result == .finite) result.finite.count else 0;
    const out = try a.alloc(u8, 8 + 76 * count);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], @intFromBool(result == .all_nonzero), .little);
    std.mem.writeInt(u32, out[4..8], @intCast(count), .little);
    if (result == .finite) for (result.finite.roots[0..count], 0..) |root, i| {
        const at = 8 + i * 76;
        if (root == .nonzero) {
            const r = root.nonzero;
            std.mem.writeInt(i32, out[at..][0..4], if (r.negative) -1 else 1, .little);
            std.mem.writeInt(u256, out[at + 4 ..][0..32], r.numerator, .little);
            std.mem.writeInt(u256, out[at + 36 ..][0..32], r.denominator, .little);
            std.mem.writeInt(i32, out[at + 68 ..][0..4], r.exponent_numerator, .little);
            std.mem.writeInt(u32, out[at + 72 ..][0..4], r.exponent_denominator, .little);
        }
    };
    return out;
}

const std = @import("std");
const level = @import("hwpjs").image.icc.normalized_power_level;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 136) return error.InvalidProbeInput;
    const result = try level.solveWide(std.mem.readInt(i32, bytes[0..4], .big), std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(u512, bytes[8..72], .big), std.mem.readInt(u512, bytes[72..136], .big));
    const count = if (result == .finite) result.finite.count else 0;
    const out = try a.alloc(u8, 8 + 268 * count);
    std.mem.writeInt(u32, out[0..4], @intFromBool(result == .all_nonzero), .little);
    std.mem.writeInt(u32, out[4..8], @intCast(count), .little);
    if (result == .finite) for (result.finite.roots[0..count], 0..) |root, i| {
        @import("icc-normalized-root-wire.zig").writeWide(out[8 + i * 268 ..][0..268], root);
    };
    return out;
}

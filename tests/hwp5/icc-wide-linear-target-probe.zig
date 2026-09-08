const std = @import("std");
const api = @import("hwpjs").image.icc.linear_rgb_target.Wide;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, compare: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != @as(usize, if (compare) 256 else 128)) return error.InvalidProbeInput;
    if (compare) {
        const left = api.Target{ .numerator = std.mem.readInt(u512, bytes[0..64], .big), .denominator = std.mem.readInt(u512, bytes[64..128], .big) };
        const right = api.Target{ .numerator = std.mem.readInt(u512, bytes[128..192], .big), .denominator = std.mem.readInt(u512, bytes[192..256], .big) };
        const order = try left.order(right);
        const out = try a.alloc(u8, 4);
        std.mem.writeInt(i32, out[0..4], switch (order) {
            .lt => -1,
            .eq => 0,
            .gt => 1,
        }, .little);
        return out;
    }
    const result = try api.normalize(std.mem.readInt(i512, bytes[0..64], .big), std.mem.readInt(u512, bytes[64..128], .big));
    const out = try a.alloc(u8, 132);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(result.clipping), .little);
    std.mem.writeInt(u512, out[4..68], result.target.numerator, .little);
    std.mem.writeInt(u512, out[68..132], result.target.denominator, .little);
    return out;
}

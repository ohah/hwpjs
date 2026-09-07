const std = @import("std");
const profile = @import("hwpjs").image.png_embedded_profile;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len < 4) return error.UnexpectedEnd;
    var value = try profile.decodeEnvelope(a, bytes[4..], .{ .max_payload_bytes = limit, .max_profile_bytes = std.mem.readInt(u32, bytes[0..4], .little) });
    defer value.deinit(a);
    const prefix = try std.math.add(usize, 8, value.name.len);
    const out = try a.alloc(u8, try std.math.add(usize, prefix, value.profile_bytes.len));
    std.mem.writeInt(u32, out[0..4], @intCast(value.name.len), .little);
    std.mem.writeInt(u32, out[4..8], @intCast(value.profile_bytes.len), .little);
    @memcpy(out[8..prefix], value.name);
    @memcpy(out[prefix..], value.profile_bytes);
    return out;
}

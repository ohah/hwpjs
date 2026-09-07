const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const h = try icc.header.parse(bytes);
    const r = try icc.header_v4_values.inspect(h);
    const out = try a.alloc(u8, 28);
    const fields = [_]u32{ @intFromBool(r.embedded), @intFromBool(r.independent_use_prohibited), r.unassigned_icc_flags, r.vendor_flags, r.media_attributes, r.vendor_attributes, r.rendering_intent };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}

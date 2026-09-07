const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.UnexpectedEnd;
    const policy = std.mem.readInt(u32, bytes[0..4], .little);
    if (policy > 1) return error.InvalidPolicy;
    const h = try icc.header.parse(bytes[4..]);
    const r = try icc.header_v2_values.inspect(h, if (policy == 0) .nearest_encoding else .rounded_four_decimals);
    const out = try a.alloc(u8, 40);
    const fields = [_]u32{ @intFromBool(r.flags.embedded), @intFromBool(r.flags.independent_use_prohibited), r.flags.unassigned_icc_flags, r.flags.vendor_flags, r.attributes.media_attributes, r.attributes.unassigned_icc_attributes, r.attributes.vendor_attributes, r.rendering_intent, r.intent_high_bits, r.nonzero_reserved_bytes };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}

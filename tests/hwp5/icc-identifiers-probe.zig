const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.UnexpectedEnd;
    const edition = std.mem.readInt(u32, bytes[0..4], .little);
    if (edition > 1) return error.InvalidPolicy;
    const h = try icc.header.parse(bytes[4..]);
    const r = try icc.header_identifiers.inspect(h, if (edition == 0) .v2_2001 else .v4_2022);
    const out = try a.alloc(u8, 16);
    const fields = [_]u32{ @intFromEnum(r.profile_class), r.data_channels, r.pcs_channels, r.registry_fields_deferred };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}

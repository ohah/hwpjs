const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const h = try icc.header.parse(bytes);
    const r = icc.header_registry.inspect(h);
    const out = try a.alloc(u8, 16);
    const fields = [_]u32{ @intFromEnum(r.cmm), @intFromEnum(r.manufacturer), @intFromEnum(r.model), @intFromEnum(r.creator) };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}

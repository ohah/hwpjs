const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const r = try core.image.png_pixels.inspect(a, bytes, .{ .structure = .{ .chunks = .{ .max_bytes = limit } } });
    const fields = [_]u32{
        @intFromBool(r.srgb != null),
        if (r.srgb) |v| @intFromEnum(v) else 0,
        @intFromBool(r.gamma != null),
        @intFromBool(r.chromaticities != null),
        @intFromBool(r.color_semantics_deferred),
        @intCast(r.structure.ancillary_chunks_deferred),
        @intCast(r.structure.ancillary_bytes_deferred),
    };
    const out = try a.alloc(u8, 28);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}

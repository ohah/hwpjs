const std = @import("std");
pub fn payload(a: std.mem.Allocator, name: []const u8, depth: u8, entries: []const [5]u16) ![]u8 {
    std.debug.assert(depth == 8 or depth == 16);
    const width: usize = if (depth == 8) 6 else 10;
    const out = try a.alloc(u8, name.len + 2 + width * entries.len);
    @memcpy(out[0..name.len], name);
    out[name.len] = 0;
    out[name.len + 1] = depth;
    for (entries, 0..) |e, i| {
        const dst = out[name.len + 2 + i * width ..][0..width];
        for (e[0..4], 0..) |v, j| {
            if (depth == 8) dst[j] = @intCast(v) else std.mem.writeInt(u16, dst[j * 2 ..][0..2], v, .big);
        }
        std.mem.writeInt(u16, dst[width - 2 ..][0..2], e[4], .big);
    }
    return out;
}

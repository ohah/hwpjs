const std = @import("std");
const curve = @import("hwpjs").image.icc.curve_type;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const value = try curve.parse(bytes);
    const out = try a.alloc(u8, bytes.len - 8);
    errdefer a.free(out);
    switch (value) {
        .identity => std.mem.writeInt(u32, out[0..4], 0, .little),
        .gamma => |raw| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            std.mem.writeInt(u16, out[4..6], raw, .little);
        },
        .samples => |samples| {
            std.mem.writeInt(u32, out[0..4], 2, .little);
            for (0..samples.count()) |i| std.mem.writeInt(u16, out[4 + i * 2 ..][0..2], try samples.at(i), .little);
        },
    }
    return out;
}

const std = @import("std");
const xyz = @import("hwpjs").image.icc.xyz_type;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, v2: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const values = try xyz.parse(bytes);
    if (v2) try @import("hwpjs").image.icc.xyz_values.validateV2_2001(values);
    const out = try a.alloc(u8, bytes.len - 8);
    errdefer a.free(out);
    for (0..values.count()) |i| {
        const value = try values.at(i);
        for (value, 0..) |v, j| std.mem.writeInt(i32, out[i * 12 + j * 4 ..][0..4], v, .little);
    }
    return out;
}

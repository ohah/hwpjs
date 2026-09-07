const std = @import("std");
const para = @import("hwpjs").image.icc.parametric_curve;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const value = try para.parse(bytes);
    const count = value.function.count();
    const out = try a.alloc(u8, 4 + count * 4);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(value.function), .little);
    for (0..count) |i| std.mem.writeInt(i32, out[4 + i * 4 ..][0..4], value.get(@enumFromInt(i)).?, .little);
    return out;
}

const std = @import("std");
const transform = @import("hwpjs").image.icc.matrix3_transform;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, inverse: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 48) return error.InvalidProbeInput;
    var matrix: [9]i32 = undefined;
    var xyz: [3]i32 = undefined;
    for (&matrix, 0..) |*v, i| v.* = std.mem.readInt(i32, bytes[i * 4 ..][0..4], .big);
    for (&xyz, 0..) |*v, i| v.* = std.mem.readInt(i32, bytes[36 + i * 4 ..][0..4], .big);
    const result = if (inverse) try transform.inverse(matrix, xyz) else transform.forward(matrix, xyz);
    const out = try a.alloc(u8, 64);
    for (result.numerators, 0..) |n, i| std.mem.writeInt(i128, out[i * 16 ..][0..16], n, .little);
    std.mem.writeInt(u128, out[48..64], result.denominator, .little);
    return out;
}

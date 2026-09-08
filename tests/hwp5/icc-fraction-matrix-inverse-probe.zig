const std = @import("std");
const api = @import("hwpjs").image.icc.matrix3_fraction_inverse;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 164) return error.InvalidProbeInput;
    var matrix: [9]i32 = undefined;
    for (&matrix, 0..) |*v, i| v.* = std.mem.readInt(i32, bytes[i * 4 ..][0..4], .big);
    var input: api.Input = undefined;
    for (&input.numerators, 0..) |*n, i| n.* = std.mem.readInt(i256, bytes[36 + i * 32 ..][0..32], .big);
    input.denominator = std.mem.readInt(u256, bytes[132..164], .big);
    const result = try api.inverse(matrix, input);
    const out = try a.alloc(u8, 256);
    for (result.numerators, 0..) |n, i| std.mem.writeInt(i512, out[i * 64 ..][0..64], n, .little);
    std.mem.writeInt(u512, out[192..256], result.denominator, .little);
    return out;
}

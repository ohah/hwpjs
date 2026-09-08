const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    const curve = try icc.parametric_curve.parse(bytes);
    try icc.parametric_domain.validate(curve);
    const power = try icc.parametric_domain.powerDomain(curve);
    const out = try a.alloc(u8, 32);
    @memset(out, 0);
    if (power) |p| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(u64, out[4..12], p.start.numerator, .little);
        std.mem.writeInt(u64, out[12..20], p.start.denominator, .little);
        std.mem.writeInt(i32, out[20..24], p.a, .little);
        std.mem.writeInt(i32, out[24..28], p.b, .little);
        std.mem.writeInt(i32, out[28..32], p.g, .little);
    }
    return out;
}

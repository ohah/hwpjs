const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, parametric: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 8) return error.InvalidProbeInput;
    const x: f64 = @bitCast(std.mem.readInt(u64, bytes[0..8], .big));
    const y = if (parametric)
        try icc.parametric_forward.evaluate(try icc.parametric_curve.parse(bytes[8..]), x)
    else blk: {
        const curve = try icc.curve_type.parse(bytes[8..]);
        break :blk switch (curve) {
            .gamma => |g| try icc.gamma_forward.evaluate(g, x),
            else => return error.InvalidIccGammaCurve,
        };
    };
    const out = try a.alloc(u8, 8);
    std.mem.writeInt(u64, out[0..8], @bitCast(y), .little);
    return out;
}

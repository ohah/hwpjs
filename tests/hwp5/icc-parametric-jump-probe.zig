const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[4..]);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.parametric_jump.inspect(128, curve),
        256 => try icc.parametric_jump.inspect(256, curve),
        512 => try icc.parametric_jump.inspect(512, curve),
        1024 => try icc.parametric_jump.inspect(1024, curve),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 24);
    @memset(out, 0);
    if (result == .boundary) {
        const boundary = result.boundary;
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(i32, out[4..8], if (boundary.order) |order| switch (order) {
            .lt => -1,
            .eq => 0,
            .gt => 1,
        } else 2, .little);
        std.mem.writeInt(u64, out[8..16], boundary.at.numerator, .little);
        std.mem.writeInt(u64, out[16..24], boundary.at.denominator, .little);
    }
    return out;
}

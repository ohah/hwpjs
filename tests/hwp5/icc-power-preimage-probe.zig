const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(128, a, bytes, limit);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(512, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const width = bits / 8;
    const prefix = 4 + 2 * width;
    const U = std.meta.Int(.unsigned, bits);
    const solve = if (bits == 128) icc.power_preimage.solve else icc.power_preimage.solveWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < prefix) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[prefix..]);
    const n = std.mem.readInt(U, bytes[4..][0..width], .big);
    const d = std.mem.readInt(U, bytes[4 + width ..][0..width], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try solve(128, curve, n, d),
        256 => try solve(256, curve, n, d),
        512 => try solve(512, curve, n, d),
        1024 => try solve(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    return if (bits == 128) @import("icc-power-preimage-output.zig").write(a, result) else @import("icc-power-preimage-output.zig").writeWide(a, result);
}

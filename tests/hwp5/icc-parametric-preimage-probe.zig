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
    const solve = if (bits == 128) icc.parametric_preimage.solve else icc.parametric_preimage.solveWide;
    const writePower = if (bits == 128) @import("icc-power-preimage-output.zig").write else @import("icc-power-preimage-output.zig").writeWide;
    const linear_size = if (bits == 128) 136 else 520;
    const writeLinear = if (bits == 128) @import("icc-wide-interval-output.zig").write else @import("icc-wide-interval-output.zig").writeExtended;
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
    if (result == .undecided) {
        const out = try a.alloc(u8, 4);
        @memset(out, 0);
        return out;
    }
    const power = try writePower(a, if (result.set.power) |p| .{ .set = p } else .inactive);
    defer a.free(power);
    const out = try a.alloc(u8, 8 + linear_size + power.len);
    std.mem.writeInt(u32, out[0..4], 1, .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(result.set.isEmpty()), .little);
    writeLinear(out[8..][0..linear_size], result.set.linear);
    @memcpy(out[8 + linear_size ..], power);
    return out;
}

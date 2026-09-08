const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const n = std.mem.readInt(u128, bytes[4..20], .big);
    const d = std.mem.readInt(u128, bytes[20..36], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.parametric_preimage.solve(128, curve, n, d),
        256 => try icc.parametric_preimage.solve(256, curve, n, d),
        512 => try icc.parametric_preimage.solve(512, curve, n, d),
        1024 => try icc.parametric_preimage.solve(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    if (result == .undecided) {
        const out = try a.alloc(u8, 4);
        @memset(out, 0);
        return out;
    }
    const power = try @import("icc-power-preimage-output.zig").write(a, if (result.set.power) |p| .{ .set = p } else .inactive);
    defer a.free(power);
    const out = try a.alloc(u8, 144 + power.len);
    std.mem.writeInt(u32, out[0..4], 1, .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(result.set.isEmpty()), .little);
    @import("icc-wide-interval-output.zig").write(out[8..144], result.set.linear);
    @memcpy(out[144..], power);
    return out;
}

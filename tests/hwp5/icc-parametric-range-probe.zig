const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[4..]);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.parametric_range.build(128, curve),
        256 => try icc.parametric_range.build(256, curve),
        512 => try icc.parametric_range.build(512, curve),
        1024 => try icc.parametric_range.build(1024, curve),
        else => return error.InvalidIccComparisonPrecision,
    };
    if (result == .undecided) {
        const out = try a.alloc(u8, 4);
        @memset(out, 0);
        return out;
    }
    const power = try @import("icc-power-range-output.zig").write(a, if (result.set.power) |p| .{ .range = p } else .inactive);
    defer a.free(power);
    const out = try a.alloc(u8, 140 + power.len);
    std.mem.writeInt(u32, out[0..4], 1, .little);
    @import("icc-wide-interval-output.zig").write(out[4..140], result.set.linear);
    @memcpy(out[140..], power);
    return out;
}

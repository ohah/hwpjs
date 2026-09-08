const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const n = std.mem.readInt(u128, bytes[4..20], .big);
    const d = std.mem.readInt(u128, bytes[20..36], .big);
    const api = icc.parametric_attained_inverse;
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try api.select(128, curve, n, d),
        256 => try api.select(256, curve, n, d),
        512 => try api.select(512, curve, n, d),
        1024 => try api.select(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, if (result == .selected) 96 else 4);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .missing_preimage => 0,
        .undecided => 1,
        .selected => 2,
    }, .little);
    if (result == .selected) @import("icc-preimage-endpoint-wire.zig").write(out[4..96], .{ .coordinate = result.selected, .attained = true });
    return out;
}

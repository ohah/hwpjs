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
    const size = if (bits == 128) 92 else 284;
    const write = if (bits == 128) @import("icc-preimage-endpoint-wire.zig").write else @import("icc-preimage-endpoint-wire.zig").writeWide;
    const select = if (bits == 128) icc.parametric_attained_inverse.select else icc.parametric_attained_inverse.selectWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < prefix) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[prefix..]);
    const n = std.mem.readInt(U, bytes[4..][0..width], .big);
    const d = std.mem.readInt(U, bytes[4 + width ..][0..width], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try select(128, curve, n, d),
        256 => try select(256, curve, n, d),
        512 => try select(512, curve, n, d),
        1024 => try select(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, if (result == .selected) 4 + size else 4);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .missing_preimage => 0,
        .undecided => 1,
        .selected => 2,
    }, .little);
    if (result == .selected) write(out[4..][0..size], .{ .coordinate = result.selected, .attained = true });
    return out;
}

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
    const endpoint_size = if (bits == 128) 92 else 284;
    const write = if (bits == 128) @import("icc-preimage-endpoint-wire.zig").write else @import("icc-preimage-endpoint-wire.zig").writeWide;
    const solve = if (bits == 128) icc.parametric_preimage_bounds.solve else icc.parametric_preimage_bounds.solveWide;
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
    const out = try a.alloc(u8, if (result == .bounds) 4 + 2 * endpoint_size else 4);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .empty => 0,
        .undecided => 1,
        .bounds => 2,
    }, .little);
    if (result == .bounds) {
        write(out[4..][0..endpoint_size], result.bounds.lower);
        write(out[4 + endpoint_size ..][0..endpoint_size], result.bounds.upper);
    }
    return out;
}

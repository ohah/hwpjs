const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn write(out: *[92]u8, endpoint: icc.parametric_preimage_bounds.Endpoint) void {
    @memset(out, 0);
    std.mem.writeInt(u32, out[4..8], @intFromBool(endpoint.attained), .little);
    switch (endpoint.coordinate) {
        .rational => |r| {
            std.mem.writeInt(u256, out[8..40], r.numerator, .little);
            std.mem.writeInt(u256, out[40..72], r.denominator, .little);
        },
        .power_root => |r| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            @import("icc-normalized-root-wire.zig").write(out[8..84], r.root);
            std.mem.writeInt(i32, out[84..88], r.a, .little);
            std.mem.writeInt(i32, out[88..92], r.b, .little);
        },
    }
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const n = std.mem.readInt(u128, bytes[4..20], .big);
    const d = std.mem.readInt(u128, bytes[20..36], .big);
    const api = icc.parametric_preimage_bounds;
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try api.solve(128, curve, n, d),
        256 => try api.solve(256, curve, n, d),
        512 => try api.solve(512, curve, n, d),
        1024 => try api.solve(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, if (result == .bounds) 188 else 4);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .empty => 0,
        .undecided => 1,
        .bounds => 2,
    }, .little);
    if (result == .bounds) {
        write(out[4..96], result.bounds.lower);
        write(out[96..188], result.bounds.upper);
    }
    return out;
}

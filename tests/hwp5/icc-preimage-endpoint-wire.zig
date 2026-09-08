const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn write(out: *[92]u8, endpoint: icc.parametric_preimage_bounds.Endpoint) void {
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

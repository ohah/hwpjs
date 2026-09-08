const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn write(out: *[92]u8, endpoint: icc.parametric_preimage_bounds.Endpoint) void {
    writeFor(32, out, endpoint);
}
pub fn writeWide(out: *[284]u8, endpoint: icc.parametric_preimage_bounds.Wide.Endpoint) void {
    writeFor(128, out, endpoint);
}
fn writeFor(comptime width: usize, out: *[28 + 2 * width]u8, endpoint: anytype) void {
    const U = std.meta.Int(.unsigned, 8 * width);
    @memset(out, 0);
    std.mem.writeInt(u32, out[4..8], @intFromBool(endpoint.attained), .little);
    switch (endpoint.coordinate) {
        .rational => |r| {
            std.mem.writeInt(U, out[8..][0..width], r.numerator, .little);
            std.mem.writeInt(U, out[8 + width ..][0..width], r.denominator, .little);
        },
        .power_root => |r| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            if (width == 32) @import("icc-normalized-root-wire.zig").write(out[8..84], r.root) else @import("icc-normalized-root-wire.zig").writeWide(out[8..276], r.root);
            std.mem.writeInt(i32, out[20 + 2 * width ..][0..4], r.a, .little);
            std.mem.writeInt(i32, out[24 + 2 * width ..][0..4], r.b, .little);
        },
    }
}

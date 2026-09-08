const std = @import("std");
const Root = @import("hwpjs").image.icc.power_level.Root;
pub fn write(out: *[20]u8, root: Root) void {
    @memset(out, 0);
    switch (root) {
        .zero => {},
        .nonzero => |r| {
            std.mem.writeInt(i32, out[0..4], if (r.negative) -1 else 1, .little);
            std.mem.writeInt(u64, out[4..12], r.numerator, .little);
            std.mem.writeInt(i32, out[12..16], r.exponent_numerator, .little);
            std.mem.writeInt(u32, out[16..20], r.exponent_denominator, .little);
        },
    }
}

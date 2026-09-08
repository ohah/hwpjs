const std = @import("std");
const Root = @import("hwpjs").image.icc.normalized_power_level.Root;
pub fn write(out: *[76]u8, root: Root) void {
    @memset(out, 0);
    if (root == .nonzero) {
        const r = root.nonzero;
        std.mem.writeInt(i32, out[0..4], if (r.negative) -1 else 1, .little);
        std.mem.writeInt(u256, out[4..36], r.numerator, .little);
        std.mem.writeInt(u256, out[36..68], r.denominator, .little);
        std.mem.writeInt(i32, out[68..72], r.exponent_numerator, .little);
        std.mem.writeInt(u32, out[72..76], r.exponent_denominator, .little);
    }
}

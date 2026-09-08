const std = @import("std");
const Root = @import("hwpjs").image.icc.normalized_power_level.Root;
pub fn write(out: *[76]u8, root: Root) void {
    writeImpl(32, out, root);
}
pub fn writeWide(out: *[268]u8, root: @import("hwpjs").image.icc.normalized_power_level.Wide.Root) void {
    writeImpl(128, out, root);
}
fn writeImpl(comptime width: usize, out: *[12 + 2 * width]u8, root: anytype) void {
    @memset(out, 0);
    if (root == .nonzero) {
        const r = root.nonzero;
        std.mem.writeInt(i32, out[0..4], if (r.negative) -1 else 1, .little);
        std.mem.writeInt(@TypeOf(r.numerator), out[4..][0..width], r.numerator, .little);
        std.mem.writeInt(@TypeOf(r.denominator), out[4 + width ..][0..width], r.denominator, .little);
        std.mem.writeInt(i32, out[4 + 2 * width ..][0..4], r.exponent_numerator, .little);
        std.mem.writeInt(u32, out[8 + 2 * width ..][0..4], r.exponent_denominator, .little);
    }
}

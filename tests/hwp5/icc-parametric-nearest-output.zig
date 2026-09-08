const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn rational(comptime width: usize, out: *[2 * width]u8, value: anytype) void {
    std.mem.writeInt(std.meta.Int(.unsigned, width * 8), out[0..width], value.numerator, .little);
    std.mem.writeInt(std.meta.Int(.unsigned, width * 8), out[width..][0..width], value.denominator, .little);
}
pub fn write(a: std.mem.Allocator, result: icc.parametric_nearest.Result) ![]u8 {
    return writeFor(32, a, result);
}
pub fn writeWide(a: std.mem.Allocator, result: icc.parametric_nearest.Wide.Result) ![]u8 {
    return writeFor(64, a, result);
}
fn writeFor(comptime width: usize, a: std.mem.Allocator, result: anytype) ![]u8 {
    const split = 4 + 2 * width;
    const status: u32 = switch (result) {
        .unattained => 0,
        .undecided => 1,
        .selected => |v| if (v == .rational) 2 else 3,
        .tie => 4,
    };
    const out = try a.alloc(u8, switch (status) {
        0, 1 => 4,
        2 => split,
        3 => 88,
        4 => split + 84,
        else => unreachable,
    });
    std.mem.writeInt(u32, out[0..4], status, .little);
    switch (result) {
        .unattained, .undecided => {},
        .selected => |v| switch (v) {
            .rational => |r| rational(width, out[4..split], r),
            .power_endpoint => |p| @import("icc-power-range-output.zig").endpoint(out[4..88], p),
        },
        .tie => |t| {
            rational(width, out[4..split], t.linear);
            @import("icc-power-range-output.zig").endpoint(out[split..][0..84], t.power_endpoint);
        },
    }
    return out;
}

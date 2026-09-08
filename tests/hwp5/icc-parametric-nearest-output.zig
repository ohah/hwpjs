const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn rational(out: *[64]u8, value: icc.parametric_nearest.types.Rational) void {
    std.mem.writeInt(u256, out[0..32], value.numerator, .little);
    std.mem.writeInt(u256, out[32..64], value.denominator, .little);
}
pub fn write(a: std.mem.Allocator, result: icc.parametric_nearest.Result) ![]u8 {
    const status: u32 = switch (result) {
        .unattained => 0,
        .undecided => 1,
        .selected => |v| if (v == .rational) 2 else 3,
        .tie => 4,
    };
    const out = try a.alloc(u8, switch (status) {
        0, 1 => 4,
        2 => 68,
        3 => 88,
        4 => 152,
        else => unreachable,
    });
    std.mem.writeInt(u32, out[0..4], status, .little);
    switch (result) {
        .unattained, .undecided => {},
        .selected => |v| switch (v) {
            .rational => |r| rational(out[4..68], r),
            .power_endpoint => |p| @import("icc-power-range-output.zig").endpoint(out[4..88], p),
        },
        .tie => |t| {
            rational(out[4..68], t.linear);
            @import("icc-power-range-output.zig").endpoint(out[68..152], t.power_endpoint);
        },
    }
    return out;
}

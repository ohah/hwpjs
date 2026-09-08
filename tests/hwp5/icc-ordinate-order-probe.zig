const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 104) return error.InvalidProbeInput;
    const input = try @import("icc-ordinate-input.zig").parse(bytes);
    const value = input.value;
    const target = input.target;
    const result = switch (input.precision) {
        128 => try icc.power_ordinate_order.compare(128, value, target),
        256 => try icc.power_ordinate_order.compare(256, value, target),
        512 => try icc.power_ordinate_order.compare(512, value, target),
        1024 => try icc.power_ordinate_order.compare(1024, value, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (result) |r| switch (r) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}

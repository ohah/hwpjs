const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(128, a, bytes, limit);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(512, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const parse = if (bits == 128) @import("icc-ordinate-input.zig").parse else @import("icc-ordinate-input.zig").parseWide;
    const compare = if (bits == 128) icc.power_ordinate_order.compare else icc.power_ordinate_order.compareWide;
    if (bytes.len > limit) return error.LimitExceeded;
    const input = try parse(bytes);
    const value = input.value;
    const target = input.target;
    const result = switch (input.precision) {
        128 => try compare(128, value, target),
        256 => try compare(256, value, target),
        512 => try compare(512, value, target),
        1024 => try compare(1024, value, target),
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

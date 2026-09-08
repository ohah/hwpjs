const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn evaluate(comptime precision: u16, bytes: []const u8) !?std.math.Order {
    return icc.rational_power_order.compare(precision, std.mem.readInt(i128, bytes[8..24], .big), std.mem.readInt(u128, bytes[24..40], .big), std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(i128, bytes[40..56], .big), std.mem.readInt(u128, bytes[56..72], .big));
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 72) return error.InvalidProbeInput;
    const order = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try evaluate(128, bytes),
        256 => try evaluate(256, bytes),
        512 => try evaluate(512, bytes),
        1024 => try evaluate(1024, bytes),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (order) |value| switch (value) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}

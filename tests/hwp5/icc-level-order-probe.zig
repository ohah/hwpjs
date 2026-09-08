const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 24) return error.InvalidProbeInput;
    const power = (try icc.parametric_segments.assemble(try icc.parametric_curve.parse(bytes[24..]))).power orelse return error.InactiveIccPowerBranch;
    const target = std.mem.readInt(i32, bytes[4..8], .big);
    const x: @TypeOf(power.interval.start) = .{ .numerator = std.mem.readInt(u64, bytes[8..16], .big), .denominator = std.mem.readInt(u64, bytes[16..24], .big) };
    const order = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.power_level_order.at(128, power, x, target),
        256 => try icc.power_level_order.at(256, power, x, target),
        512 => try icc.power_level_order.at(512, power, x, target),
        1024 => try icc.power_level_order.at(1024, power, x, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (order) |o| switch (o) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}

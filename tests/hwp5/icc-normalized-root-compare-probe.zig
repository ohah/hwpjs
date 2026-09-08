const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 144) return error.InvalidProbeInput;
    const sign = std.mem.readInt(i32, bytes[4..8], .big);
    const root: icc.normalized_power_level.Root = if (sign == 0) blk: {
        for (bytes[8..80]) |v| if (v != 0) return error.InvalidProbeInput;
        break :blk .zero;
    } else if (sign == 1 or sign == -1) .{ .nonzero = .{
        .negative = sign == -1,
        .numerator = std.mem.readInt(u256, bytes[8..40], .big),
        .denominator = std.mem.readInt(u256, bytes[40..72], .big),
        .exponent_numerator = std.mem.readInt(i32, bytes[72..76], .big),
        .exponent_denominator = std.mem.readInt(u32, bytes[76..80], .big),
    } } else return error.InvalidProbeInput;
    const n = std.mem.readInt(i256, bytes[80..112], .big);
    const d = std.mem.readInt(u256, bytes[112..144], .big);
    const order = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.normalized_power_root_compare.compare(128, root, n, d),
        256 => try icc.normalized_power_root_compare.compare(256, root, n, d),
        512 => try icc.normalized_power_root_compare.compare(512, root, n, d),
        1024 => try icc.normalized_power_root_compare.compare(1024, root, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (order) |v| switch (v) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}

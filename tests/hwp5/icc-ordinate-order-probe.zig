const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 104) return error.InvalidProbeInput;
    const value: icc.power_ordinate.Value = switch (std.mem.readInt(u32, bytes[36..40], .big)) {
        0 => .{ .rational = .{ .numerator = std.mem.readInt(u256, bytes[40..72], .big), .denominator = std.mem.readInt(u256, bytes[72..104], .big) } },
        1 => blk: {
            for (bytes[80..104]) |b| if (b != 0) return error.InvalidProbeInput;
            break :blk .{ .power = .{ .base = .{ .numerator = std.mem.readInt(i128, bytes[40..56], .big), .denominator = std.mem.readInt(u128, bytes[56..72], .big) }, .g = std.mem.readInt(i32, bytes[72..76], .big), .offset = std.mem.readInt(i32, bytes[76..80], .big) } };
        },
        else => return error.InvalidProbeInput,
    };
    const target = icc.power_ordinate_order.Target{ .numerator = std.mem.readInt(u128, bytes[4..20], .big), .denominator = std.mem.readInt(u128, bytes[20..36], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
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

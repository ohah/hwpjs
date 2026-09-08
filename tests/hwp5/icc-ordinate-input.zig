const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub const Input = struct { value: icc.power_ordinate.Value, target: icc.power_ordinate_order.Target, precision: u32 };
pub fn parse(bytes: []const u8) !Input {
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
    return .{ .value = value, .target = target, .precision = std.mem.readInt(u32, bytes[0..4], .big) };
}

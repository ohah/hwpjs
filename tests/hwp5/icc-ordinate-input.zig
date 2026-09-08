const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub const Input = Of(128);
pub fn Of(comptime bits: u16) type {
    return struct { value: icc.power_ordinate.Value, target: icc.fraction.Normalized(bits), precision: u32 };
}
pub fn parse(bytes: []const u8) !Input {
    return parseFor(128, bytes);
}
pub fn parseWide(bytes: []const u8) !Of(512) {
    return parseFor(512, bytes);
}
fn parseFor(comptime bits: u16, bytes: []const u8) !Of(bits) {
    const width = bits / 8;
    const prefix = 4 + 2 * width;
    const U = std.meta.Int(.unsigned, bits);
    if (bytes.len != prefix + 68) return error.InvalidProbeInput;
    const payload = bytes[prefix..];
    const value: icc.power_ordinate.Value = switch (std.mem.readInt(u32, payload[0..4], .big)) {
        0 => .{ .rational = .{ .numerator = std.mem.readInt(u256, payload[4..36], .big), .denominator = std.mem.readInt(u256, payload[36..68], .big) } },
        1 => blk: {
            for (payload[44..68]) |b| if (b != 0) return error.InvalidProbeInput;
            break :blk .{ .power = .{ .base = .{ .numerator = std.mem.readInt(i128, payload[4..20], .big), .denominator = std.mem.readInt(u128, payload[20..36], .big) }, .g = std.mem.readInt(i32, payload[36..40], .big), .offset = std.mem.readInt(i32, payload[40..44], .big) } };
        },
        else => return error.InvalidProbeInput,
    };
    const target = icc.fraction.Normalized(bits){ .numerator = std.mem.readInt(U, bytes[4..][0..width], .big), .denominator = std.mem.readInt(U, bytes[4 + width ..][0..width], .big) };
    return .{ .value = value, .target = target, .precision = std.mem.readInt(u32, bytes[0..4], .big) };
}

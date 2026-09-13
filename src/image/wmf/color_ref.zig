const std = @import("std");

pub const ReservedPolicy = enum { specified_zero, observed_preserve };

pub const ColorRef = struct {
    raw: u32,
    red: u8,
    green: u8,
    blue: u8,
    reserved: u8,
};

pub fn parse(bytes: *const [4]u8, policy: ReservedPolicy) !ColorRef {
    const reserved = bytes[3];
    if (policy == .specified_zero and reserved != 0) return error.InvalidWmfColorReserved;
    return .{
        .raw = std.mem.readInt(u32, bytes, .little),
        .red = bytes[0],
        .green = bytes[1],
        .blue = bytes[2],
        .reserved = reserved,
    };
}

const std = @import("std");
/// PNG gAMA/cHRM wire units. Do not round through a floating-point representation.
pub const scale: u32 = 100000;
pub fn read(bytes: []const u8) !u32 {
    if (bytes.len != 4) return error.InvalidPngColorIntegerSize;
    const value = std.mem.readInt(u32, bytes[0..4], .big);
    if (value > 0x7fffffff) return error.InvalidPngColorInteger;
    return value;
}

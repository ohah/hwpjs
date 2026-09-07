const std = @import("std");
pub const Value = struct { x: u32, y: u32, unit: u8 };
pub fn parse(bytes: []const u8) !Value {
    if (bytes.len != 9) return error.InvalidPngPhysicalSize;
    const x = std.mem.readInt(u32, bytes[0..4], .big);
    const y = std.mem.readInt(u32, bytes[4..8], .big);
    if (x > 0x7fffffff or y > 0x7fffffff) return error.InvalidPngPhysicalValue;
    if (bytes[8] > 1) return error.UnsupportedPngPhysicalUnit;
    return .{ .x = x, .y = y, .unit = bytes[8] };
}

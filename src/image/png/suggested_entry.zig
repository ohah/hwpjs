const std = @import("std");
pub const Entry = struct { rgba: [4]u16, frequency: u16 };
pub fn width(depth: u8) !usize {
    return switch (depth) {
        8 => 6,
        16 => 10,
        else => error.InvalidPngSuggestedDepth,
    };
}
pub fn read(depth: u8, bytes: []const u8) !Entry {
    if (bytes.len != try width(depth)) return error.InvalidPngSuggestedEntrySize;
    var rgba: [4]u16 = undefined;
    for (&rgba, 0..) |*v, i| v.* = if (depth == 8) bytes[i] else std.mem.readInt(u16, bytes[i * 2 ..][0..2], .big);
    return .{ .rgba = rgba, .frequency = std.mem.readInt(u16, bytes[bytes.len - 2 ..][0..2], .big) };
}

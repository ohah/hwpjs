const std = @import("std");
const Header = @import("header.zig").Header;
pub const Value = struct { frequencies: [256]u16 = @splat(0), count: u16 };
pub fn parse(h: Header, palette_entries: usize, bytes: []const u8) !Value {
    try h.validatePaletteCount(palette_entries);
    if (bytes.len != palette_entries * 2) return error.InvalidPngHistogramSize;
    var result: Value = .{ .count = @intCast(palette_entries) };
    for (result.frequencies[0..palette_entries], 0..) |*frequency, i| frequency.* = std.mem.readInt(u16, bytes[i * 2 ..][0..2], .big);
    return result;
}

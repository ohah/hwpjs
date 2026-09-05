const std = @import("std");
const h = @import("header.zig");

/// Validate UTF-16 before legacy NUL removal, so removed units cannot repair broken pairs.
pub fn decode(a: std.mem.Allocator, data: []const u8, live: bool) ![]const u8 {
    const length = try h.int(u16, data, 64);
    if (length > 64 or length % 2 != 0) return error.InvalidName;
    if (live and (length < 2 or try h.int(u16, data, length - 2) != 0))
        return error.InvalidName;
    var units: [32]u16 = undefined;
    for (0..length / 2) |i| units[i] = try h.int(u16, data, i * 2);
    const decoded = try std.unicode.utf16LeToUtf8Alloc(a, units[0 .. length / 2]);
    var count: usize = 0;
    for (decoded) |byte| {
        if (byte == 0) continue;
        if (live and std.mem.indexOfScalar(u8, "/\\:!", byte) != null) return error.InvalidName;
        decoded[count] = byte;
        count += 1;
    }
    return decoded[0..count];
}

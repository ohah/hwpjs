const std = @import("std");
pub const Entry = struct { signature: [4]u8, offset: u32, size: u32 };
/// Synthetic structural fixture, not a complete colour profile.
pub fn make(a: std.mem.Allocator, size: usize, entries: []const Entry) ![]u8 {
    if (size < 132 + entries.len * 12) return error.InvalidFixtureSize;
    const bytes = try a.alloc(u8, size);
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], @intCast(size), .big);
    bytes[8..12].* = .{ 4, 0x40, 0, 0 };
    bytes[36..40].* = "acsp".*;
    std.mem.writeInt(u32, bytes[128..132], @intCast(entries.len), .big);
    for (entries, 0..) |e, i| {
        const at = 132 + i * 12;
        bytes[at..][0..4].* = e.signature;
        std.mem.writeInt(u32, bytes[at + 4 ..][0..4], e.offset, .big);
        std.mem.writeInt(u32, bytes[at + 8 ..][0..4], e.size, .big);
    }
    for (entries) |e| if (e.offset >= 132 + entries.len * 12 and e.offset <= size and size - e.offset >= 8 and e.size >= 8) {
        bytes[e.offset..][0..4].* = "data".*;
    };
    return bytes;
}

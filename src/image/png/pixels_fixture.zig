const std = @import("std");
pub fn image(a: std.mem.Allocator, value: u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, @import("chunks.zig").signature);
    const ihdr = [_]u8{ 0, 0, 0, 1, 0, 0, 0, 1, 1, 3, 0, 0, 1 };
    try chunk(a, &out, "IHDR", &ihdr);
    try chunk(a, &out, "PLTE", &.{ 7, 8, 9 });
    var compressed = [_]u8{ 0x78, 1, 1, 2, 0, 0xfd, 0xff, 0, value, 0, 0, 0, 0 };
    std.mem.writeInt(u32, compressed[9..13], std.hash.Adler32.hash(compressed[7..9]), .big);
    // Every zlib byte in its own IDAT; includes split header and checksum.
    for (compressed) |byte| try chunk(a, &out, "IDAT", &.{byte});
    try chunk(a, &out, "IEND", &.{});
    return out.toOwnedSlice(a);
}
fn chunk(a: std.mem.Allocator, out: *std.ArrayList(u8), name: *const [4]u8, data: []const u8) !void {
    var len: [4]u8 = undefined;
    std.mem.writeInt(u32, &len, @intCast(data.len), .big);
    try out.appendSlice(a, &len);
    const start = out.items.len;
    try out.appendSlice(a, name);
    try out.appendSlice(a, data);
    std.mem.writeInt(u32, &len, std.hash.Crc32.hash(out.items[start..]), .big);
    try out.appendSlice(a, &len);
}

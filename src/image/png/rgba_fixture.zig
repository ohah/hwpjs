const std = @import("std");
const chunks = @import("chunks.zig");

fn chunk(a: std.mem.Allocator, out: *std.ArrayList(u8), name: *const [4]u8, data: []const u8) !void {
    var number: [4]u8 = undefined;
    std.mem.writeInt(u32, &number, @intCast(data.len), .big);
    try out.appendSlice(a, &number);
    const start = out.items.len;
    try out.appendSlice(a, name);
    try out.appendSlice(a, data);
    std.mem.writeInt(u32, &number, std.hash.Crc32.hash(out.items[start..]), .big);
    try out.appendSlice(a, &number);
}

/// Small test PNG with a single uncompressed DEFLATE block.
pub fn image(a: std.mem.Allocator, width: u32, height: u32, depth: u8, color: u8, interlace: u8, rows: []const u8, palette: ?[]const u8, alpha: ?[]const u8) ![]u8 {
    if (rows.len > std.math.maxInt(u16)) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, chunks.signature);
    var ihdr: [13]u8 = .{ 0, 0, 0, 0, 0, 0, 0, 0, depth, color, 0, 0, interlace };
    std.mem.writeInt(u32, ihdr[0..4], width, .big);
    std.mem.writeInt(u32, ihdr[4..8], height, .big);
    try chunk(a, &out, "IHDR", &ihdr);
    if (palette) |bytes| try chunk(a, &out, "PLTE", bytes);
    if (alpha) |bytes| try chunk(a, &out, "tRNS", bytes);
    var compressed: std.ArrayList(u8) = .empty;
    defer compressed.deinit(a);
    try compressed.appendSlice(a, &.{ 0x78, 0x01, 0x01 });
    var word: [2]u8 = undefined;
    std.mem.writeInt(u16, &word, @intCast(rows.len), .little);
    try compressed.appendSlice(a, &word);
    std.mem.writeInt(u16, &word, ~@as(u16, @intCast(rows.len)), .little);
    try compressed.appendSlice(a, &word);
    try compressed.appendSlice(a, rows);
    var checksum: [4]u8 = undefined;
    std.mem.writeInt(u32, &checksum, std.hash.Adler32.hash(rows), .big);
    try compressed.appendSlice(a, &checksum);
    try chunk(a, &out, "IDAT", compressed.items);
    try chunk(a, &out, "IEND", &.{});
    return out.toOwnedSlice(a);
}

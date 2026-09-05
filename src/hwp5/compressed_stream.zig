const std = @import("std");
const deflate = @import("../compression/raw_deflate.zig");

/// Observed HWP streams have either no trailer or a CRC32 + ISIZE gzip-style
/// trailer after raw DEFLATE. Never silently discard arbitrary suffixes.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const result = try deflate.decodePrefix(a, bytes, limit);
    errdefer a.free(result.bytes);
    const tail = bytes[result.consumed..];
    if (tail.len != 0) {
        if (tail.len != 8) return error.TrailingData;
        const crc = std.mem.readInt(u32, tail[0..4], .little);
        const size = std.mem.readInt(u32, tail[4..8], .little);
        if (crc != std.hash.Crc32.hash(result.bytes) or size != @as(u32, @truncate(result.bytes.len)))
            return error.InvalidChecksum;
    }
    return result.bytes;
}

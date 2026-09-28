const std = @import("std");
const deflate = @import("../compression/raw_deflate.zig");
const zlib = @import("../compression/zlib.zig");

/// Raw DEFLATE remains the primary HWP encoding. Some observed HWP streams use
/// a complete RFC1950 zlib envelope instead. The two checksums/trailers are
/// distinct; neither path silently discards suffix bytes.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const result = deflate.decodePrefix(a, bytes, limit) catch |err| switch (err) {
        error.InvalidDeflate => {
            if (zlib.hasHeader(bytes)) return zlib.decode(a, bytes, limit);
            return err;
        },
        else => return err,
    };
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

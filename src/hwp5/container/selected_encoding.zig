const std = @import("std");
/// Caller-selected storage model, independent of FileHeader flags.
pub const Encoding = enum { decoded, observed_hwp_compressed };
/// Returns owned bytes. Never retries another codec after failure.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, limit: usize, encoding: Encoding) ![]u8 {
    return switch (encoding) {
        .decoded => blk: {
            if (bytes.len > limit) return error.LimitExceeded;
            break :blk try a.dupe(u8, bytes);
        },
        .observed_hwp_compressed => @import("../compressed_stream.zig").decode(a, bytes, limit),
    };
}

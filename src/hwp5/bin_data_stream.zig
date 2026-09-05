const std = @import("std");
const Header = @import("file_header.zig").Header;
const BinData = @import("docinfo/bin_data.zig").BinData;

/// Caller supplies the exact CFB stream. Never reads external LINK paths or
/// guesses another stream after an error. Returns caller-owned bytes.
pub fn decode(a: std.mem.Allocator, header: *const Header, item: BinData, bytes: []const u8, limit: usize) ![]u8 {
    try @import("stream.zig").requireSupported(header);
    switch (item.data) {
        .link => return error.ExternalLink,
        .unknown => return error.UnsupportedBinDataType,
        else => {},
    }
    if (try item.isCompressed(header.has(.compressed)))
        return @import("compressed_stream.zig").decode(a, bytes, limit);
    if (bytes.len > limit) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

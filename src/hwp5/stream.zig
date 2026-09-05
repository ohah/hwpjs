const std = @import("std");
const Header = @import("file_header.zig").Header;
const compressed = @import("compressed_stream.zig");

/// Only DocInfo / BodyText section streams. BinData has per-item compression rules.
/// Always returns an owned buffer, including uncompressed streams.
pub fn decode(a: std.mem.Allocator, header: *const Header, bytes: []const u8, max_output: usize) ![]u8 {
    try header.version().requireSupported();
    if (header.has(.encrypted) or header.has(.certificate_encryption))
        return error.UnsupportedEncryption;
    if (header.has(.drm) or header.has(.certificate_drm)) return error.UnsupportedDrm;
    if (header.has(.distribution)) return error.UnsupportedDistribution;
    if (header.has(.compressed)) return compressed.decode(a, bytes, max_output);
    if (bytes.len > max_output) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

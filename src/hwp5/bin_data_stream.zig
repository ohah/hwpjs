const std = @import("std");
const Header = @import("file_header.zig").Header;
const BinData = @import("docinfo/bin_data.zig").BinData;

/// Caller supplies the exact CFB stream. Never reads external LINK paths or
/// guesses another stream after an error. Returns caller-owned bytes.
pub fn decode(a: std.mem.Allocator, header: *const Header, item: BinData, bytes: []const u8, limit: usize) ![]u8 {
    return decodeWithPolicy(a, header, item, bytes, limit, .reject);
}
pub fn decodeWithPolicy(a: std.mem.Allocator, header: *const Header, item: BinData, bytes: []const u8, limit: usize, policy: @import("feature_policy.zig").Distribution) ![]u8 {
    if (try compressionPolicy(header, item, policy))
        return @import("compressed_stream.zig").decode(a, bytes, limit);
    if (bytes.len > limit) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

/// Encodes decoded BinData bytes using the same item/header compression policy
/// as decode. Stored raw-DEFLATE blocks are deterministic and trailer-free.
pub fn encode(a: std.mem.Allocator, header: *const Header, item: BinData, bytes: []const u8, limit: usize) ![]u8 {
    return encodeWithPolicy(a, header, item, bytes, limit, .reject);
}

pub fn encodeWithPolicy(a: std.mem.Allocator, header: *const Header, item: BinData, bytes: []const u8, limit: usize, policy: @import("feature_policy.zig").Distribution) ![]u8 {
    if (try compressionPolicy(header, item, policy))
        return @import("../compression/raw_deflate.zig").encodeStored(a, bytes, limit);
    if (bytes.len > limit) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

fn compressionPolicy(header: *const Header, item: BinData, policy: @import("feature_policy.zig").Distribution) !bool {
    try @import("feature_policy.zig").requireSupported(header, policy);
    switch (item.data) {
        .link => return error.ExternalLink,
        .unknown => return error.UnsupportedBinDataType,
        else => {},
    }
    return item.isCompressed(header.has(.compressed));
}

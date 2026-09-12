const std = @import("std");
const Header = @import("file_header.zig").Header;
const compressed = @import("compressed_stream.zig");
const policy = @import("feature_policy.zig");

/// DocInfo / BodyText / Scripts streams. BinData has per-item compression rules.
/// Always returns an owned buffer, including uncompressed streams.
pub fn decode(a: std.mem.Allocator, header: *const Header, bytes: []const u8, max_output: usize) ![]u8 {
    return decodeWithPolicy(a, header, bytes, max_output, .reject);
}
/// Explicit observed ordinary-stream encoding. Never decrypts a ViewText envelope.
pub fn decodeWithPolicy(a: std.mem.Allocator, header: *const Header, bytes: []const u8, max_output: usize, distribution: policy.Distribution) ![]u8 {
    try policy.requireSupported(header, distribution);
    if (header.has(.compressed)) return compressed.decode(a, bytes, max_output);
    if (bytes.len > max_output) return error.LimitExceeded;
    return a.dupe(u8, bytes);
}

pub fn requireSupported(header: *const Header) !void {
    try policy.requireSupported(header, .reject);
}

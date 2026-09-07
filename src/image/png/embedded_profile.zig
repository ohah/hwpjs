const std = @import("std");
const keyword = @import("keyword.zig");
const zlib = @import("../../compression/zlib.zig");
pub const Options = struct {
    max_payload_bytes: usize = 64 * 1024 * 1024,
    max_profile_bytes: usize = 64 * 1024 * 1024,
};
/// Decoded iCCP envelope, NOT a validated ICC profile.
/// The name borrows the input; profile_bytes are owned even if empty.
pub const Envelope = struct {
    name: []const u8,
    profile_bytes: []u8,
    pub fn deinit(self: *Envelope, a: std.mem.Allocator) void {
        a.free(self.profile_bytes);
        self.* = undefined;
    }
};
/// The caller owns chunk CRC/order/uniqueness and subsequent ICC validation.
/// Uses exactly one PNG-profile zlib stream, with no gzip/raw/trailing fallback.
pub fn decodeEnvelope(a: std.mem.Allocator, bytes: []const u8, options: Options) !Envelope {
    if (bytes.len > options.max_payload_bytes) return error.LimitExceeded;
    const prefix = try keyword.split(bytes);
    if (prefix.remaining.len == 0) return error.MissingPngProfileCompressionMethod;
    if (prefix.remaining[0] != 0) return error.UnsupportedPngProfileCompressionMethod;
    const profile = try zlib.decode(a, prefix.remaining[1..], options.max_profile_bytes);
    return .{ .name = prefix.keyword, .profile_bytes = profile };
}

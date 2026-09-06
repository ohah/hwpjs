const std = @import("std");
pub const envelope = @import("envelope.zig");
pub const Options = struct { compressed: bool = true, max_ciphertext_bytes: usize = 64 * 1024 * 1024, max_output_bytes: usize = 64 * 1024 * 1024 };
/// Distribution obfuscation only: no password/DRM decryption or authentication claim.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) ![]u8 {
    const e = try envelope.parse(bytes, options.max_ciphertext_bytes);
    if (!options.compressed and e.ciphertext.len > options.max_output_bytes) return error.LimitExceeded;
    const plain = try a.alloc(u8, e.ciphertext.len);
    const cipher = std.crypto.core.aes.Aes128.initDec(@import("key.zig").derive(e.data));
    var at: usize = 0;
    while (at < plain.len) : (at += 16) cipher.decrypt(plain[at..][0..16], e.ciphertext[at..][0..16]);
    if (!options.compressed) return plain; // All block bytes, without guessing padding.
    defer a.free(plain);
    return decodeCompressed(a, plain, options.max_output_bytes);
}
fn decodeCompressed(a: std.mem.Allocator, plain: []const u8, limit: usize) ![]u8 {
    const result = try @import("../../compression/raw_deflate.zig").decodePrefix(a, plain, limit);
    errdefer a.free(result.bytes);
    try @import("trailer.zig").validate(plain, result.consumed, result.bytes);
    return result.bytes;
}

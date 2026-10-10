//! Explicit observed DES compact envelope. No package or version fallback.
const std = @import("std");
pub const Options = @import("password_stream.zig").Options;

pub fn decryptCompressed(a: std.mem.Allocator, cipher: []const u8, password: []const u8, options: Options) ![]u8 {
    if (cipher.len > options.max_ciphertext_bytes or password.len > options.max_password_bytes) return error.LimitExceeded;
    const encrypted = try @import("password_footer.zig").payloadFor(cipher, .des);
    var key = try @import("password_legacy_key.zig").derive(password, options.max_password_bytes);
    defer std.crypto.secureZero(u8, &key);
    const raw = try a.alloc(u8, encrypted.len);
    defer {
        std.crypto.secureZero(u8, raw);
        a.free(raw);
    }
    try @import("../crypto/des_ecb.zig").decrypt(key, encrypted, raw);
    @import("password_footer.zig").validateFor(cipher, raw, .des) catch return error.WrongPasswordOrCorruptPayload;
    const result = @import("../compression/raw_deflate.zig").decodePrefix(a, raw, options.max_output_bytes) catch |err| switch (err) {
        error.OutOfMemory, error.LimitExceeded => return err,
        else => return error.WrongPasswordOrCorruptPayload,
    };
    errdefer {
        std.crypto.secureZero(u8, result.bytes);
        a.free(result.bytes);
    }
    @import("password_compact_trailer.zig").validate(raw, result.consumed, result.bytes) catch return error.WrongPasswordOrCorruptPayload;
    return result.bytes;
}

//! Observed version4 compressed password stream. No CFB mutation or fallback.
const std = @import("std");
pub const Options = struct {
    max_ciphertext_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 64 * 1024 * 1024,
    max_password_bytes: usize = 4096,
};

/// Caller owns returned plaintext. CRC checks are not authentication.
pub fn decryptCompressed(a: std.mem.Allocator, cipher: []const u8, password: []const u8, encrypt_version: u32, options: Options) ![]u8 {
    if (encrypt_version != 4) return error.UnsupportedPasswordScheme;
    if (cipher.len > options.max_ciphertext_bytes or password.len > options.max_password_bytes) return error.LimitExceeded;
    const encrypted = try @import("password_footer.zig").payload(cipher);
    var key = try @import("password_key.zig").derive(password, options.max_password_bytes);
    defer std.crypto.secureZero(u8, &key);
    const raw = try a.alloc(u8, encrypted.len);
    defer {
        std.crypto.secureZero(u8, raw);
        a.free(raw);
    }
    try @import("../crypto/aes128_cfb1.zig").transform(key, @splat(0), encrypted, raw, .decrypt);
    @import("password_footer.zig").validate(cipher, raw) catch return error.WrongPasswordOrCorruptPayload;
    const result = @import("../compression/raw_deflate.zig").decodePrefix(a, raw, options.max_output_bytes) catch |err| switch (err) {
        error.OutOfMemory, error.LimitExceeded => return err,
        else => return error.WrongPasswordOrCorruptPayload,
    };
    errdefer {
        std.crypto.secureZero(u8, result.bytes);
        a.free(result.bytes);
    }
    @import("distribution/trailer.zig").validate(raw, result.consumed, result.bytes) catch return error.WrongPasswordOrCorruptPayload;
    return result.bytes;
}

test "HWP5 password stream preflight rejects unsupported schemes before allocation" {
    const a = std.testing.failing_allocator;
    try std.testing.expectError(error.UnsupportedPasswordScheme, decryptCompressed(a, "", "", 0, .{}));
    try std.testing.expectError(error.LimitExceeded, decryptCompressed(a, "abc", "", 4, .{ .max_ciphertext_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, decryptCompressed(a, "", "abc", 4, .{ .max_password_bytes = 2 }));
    try std.testing.expectError(error.UnexpectedEnd, decryptCompressed(a, "", "", 4, .{}));
}

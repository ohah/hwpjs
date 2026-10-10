//! One validated AES256-CBC/raw-DEFLATE HWPX entry. No package mutation.
const std = @import("std");
const parameters = @import("encryption_parameters.zig");
const key = @import("password_key.zig");
const cbc = @import("../crypto/aes256_cbc.zig");
const deflate = @import("../compression/raw_deflate.zig");
pub const Options = struct {
    max_ciphertext_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 64 * 1024 * 1024,
    key_limits: key.Limits = .{},
};

/// Caller owns returned plaintext. First-1KiB checksum is not full authenticity.
pub fn decrypt(a: std.mem.Allocator, ciphertext: []const u8, password: []const u8, metadata: parameters.Parameters, declared_size: usize, options: Options) ![]u8 {
    if (ciphertext.len > options.max_ciphertext_bytes or declared_size > options.max_output_bytes) return error.LimitExceeded;
    if (ciphertext.len == 0 or ciphertext.len % 16 != 0) return error.WrongPasswordOrCorruptPayload;
    // Validate caller-supplied parameters before allocating a ciphertext buffer.
    if (password.len > options.key_limits.max_password_bytes or metadata.salt.len > options.key_limits.max_salt_bytes or metadata.iterations > options.key_limits.max_iterations) return error.LimitExceeded;
    if (metadata.salt.len == 0 or metadata.iterations == 0) return error.InvalidKeyParameters;
    const raw = try a.alloc(u8, ciphertext.len);
    defer {
        std.crypto.secureZero(u8, raw);
        a.free(raw);
    }
    var exceeded = false;
    for ([_]key.Prf{ .sha1, .sha256 }) |prf| {
        var derived = try key.derive(password, metadata.salt, metadata.iterations, prf, options.key_limits);
        defer std.crypto.secureZero(u8, &derived);
        try cbc.decrypt(derived, metadata.iv, ciphertext, raw);
        const result = deflate.decodePrefix(a, raw, @min(declared_size, options.max_output_bytes)) catch |err| switch (err) {
            error.OutOfMemory => return err,
            error.LimitExceeded => {
                // A wrong first PRF can accidentally form expanding DEFLATE.
                // Still try the second PRF with the same hard output bound.
                exceeded = true;
                continue;
            },
            else => continue,
        };
        // ODF CBC alignment is not PKCS7. Do not guess/remove it as padding.
        const valid = result.bytes.len == declared_size and raw.len - result.consumed < 16;
        var checksum: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(result.bytes[0..@min(1024, result.bytes.len)], &checksum, .{});
        if (valid and std.mem.eql(u8, &checksum, &metadata.checksum)) return result.bytes;
        std.crypto.secureZero(u8, result.bytes);
        a.free(result.bytes);
    }
    if (exceeded) return error.LimitExceeded;
    return error.WrongPasswordOrCorruptPayload;
}

test "HWPX password entry independent two PRF ciphertexts failures and OOM" {
    var salt = [_]u8{ 0xc9, 0x79, 0xc9, 0x0d, 0x1b, 0x83, 0xcf, 0x26, 0x89, 0x65, 0x8d, 0x05, 0xe5, 0xb2, 0xb6, 0xc1 };
    var checksum: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&checksum, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    const metadata: parameters.Parameters = .{ .iv = salt, .salt = &salt, .checksum = checksum, .iterations = 1024 };
    const Probe = struct {
        fn run(a: std.mem.Allocator, bytes: []const u8, meta: parameters.Parameters) !void {
            const output = try decrypt(a, bytes, "123456", meta, 5, .{});
            defer a.free(output);
            try std.testing.expectEqualStrings("hello", output);
        }
    };
    for ([_][]const u8{ "2b799db5d697fae0839bd6ac7445e96b", "4bf282b287ba8dba8e664526f552667c" }) |hex| {
        var ciphertext: [16]u8 = undefined;
        _ = try std.fmt.hexToBytes(&ciphertext, hex);
        try Probe.run(std.testing.allocator, &ciphertext, metadata);
        try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &ciphertext, metadata });
        try std.testing.expectError(error.WrongPasswordOrCorruptPayload, decrypt(std.testing.allocator, &ciphertext, "wrong", metadata, 5, .{}));
        try std.testing.expectError(error.LimitExceeded, decrypt(std.testing.allocator, &ciphertext, "123456", metadata, 5, .{ .max_output_bytes = 4 }));
        try std.testing.expectError(error.LimitExceeded, decrypt(std.testing.allocator, &ciphertext, "123456", metadata, 5, .{ .max_ciphertext_bytes = 15 }));
        var damaged = metadata;
        damaged.checksum[0] ^= 1;
        try std.testing.expectError(error.WrongPasswordOrCorruptPayload, decrypt(std.testing.allocator, &ciphertext, "123456", damaged, 5, .{}));
        try std.testing.expectError(error.WrongPasswordOrCorruptPayload, decrypt(std.testing.allocator, ciphertext[0..15], "123456", metadata, 5, .{}));
    }
    // Node-generated SHA256 vector whose wrong SHA1 stream exceeds the bound.
    var alternate_salt = [_]u8{0} ** 16;
    alternate_salt[0] = 0x70;
    var alternate = metadata;
    alternate.salt = &alternate_salt;
    alternate.iterations = 1;
    var ciphertext: [16]u8 = undefined;
    _ = try std.fmt.hexToBytes(&ciphertext, "09c5ab5918fd785ba369ecefd164e1df");
    var wrong_raw: [16]u8 = undefined;
    _ = try std.fmt.hexToBytes(&wrong_raw, "fbcaa526d4220a9800ad830e915b47ba");
    try std.testing.expectError(error.LimitExceeded, deflate.decodePrefix(std.testing.allocator, &wrong_raw, 5));
    try Probe.run(std.testing.allocator, &ciphertext, alternate);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &ciphertext, alternate });
}

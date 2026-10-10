//! ODF HWPX key derivation, independent of XML, ZIP and password UI.
const std = @import("std");
pub const Prf = enum { sha1, sha256 };
pub const Limits = struct {
    max_password_bytes: usize = 4096,
    max_salt_bytes: usize = 1024,
    max_iterations: u32 = 1_000_000,
};

/// Password is exact caller-owned bytes, not a NUL-terminated string.
/// Caller must clear the returned key after use. No password is retained.
pub fn derive(password: []const u8, salt: []const u8, iterations: u32, prf: Prf, limits: Limits) ![32]u8 {
    if (password.len > limits.max_password_bytes or salt.len > limits.max_salt_bytes or iterations > limits.max_iterations) return error.LimitExceeded;
    if (iterations == 0 or salt.len == 0) return error.InvalidKeyParameters;
    var start: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(password, &start, .{});
    defer std.crypto.secureZero(u8, &start);
    var key: [32]u8 = undefined;
    errdefer std.crypto.secureZero(u8, &key);
    switch (prf) {
        .sha1 => try std.crypto.pwhash.pbkdf2(&key, &start, salt, iterations, std.crypto.auth.hmac.HmacSha1),
        .sha256 => try std.crypto.pwhash.pbkdf2(&key, &start, salt, iterations, std.crypto.auth.hmac.sha2.HmacSha256),
    }
    return key;
}

test "HWPX password key matches independent Node for both PRFs and exact bytes" {
    const salt = [_]u8{ 0xc9, 0x79, 0xc9, 0x0d, 0x1b, 0x83, 0xcf, 0x26, 0x89, 0x65, 0x8d, 0x05, 0xe5, 0xb2, 0xb6, 0xc1 };
    const passwords = [_][]const u8{ "123456", "한글\x00😀", "" };
    const expected = [_][2][]const u8{
        .{ "421e27a28fa4571727898f39709431bd4b75632245234991fc1179648d2ef90d", "98b509eabeb071c696c252863ba4cc50f6d36f864155bc2c9b88d8998ced14c6" },
        .{ "660dc5d7e586984506c4fca80b1a47c1013302395552caea1d3f41842b6531a3", "145e5ca2f77eaad40f86c3fb9112d6c02c7242ec9f4409b3370883ca856584c6" },
        .{ "1e02b340c105fbb52347daa83fd5ae60ffb23281b5e37c0a427497eac42f2a56", "365ac870b0c5d25a2b775d0eb01dcd19bcfd8636fa38f0bb60ae25e6b09cc03a" },
    };
    for (passwords, expected) |password, pair| {
        for ([_]Prf{ .sha1, .sha256 }, pair) |prf, hex| {
            var reference: [32]u8 = undefined;
            _ = try std.fmt.hexToBytes(&reference, hex);
            var key = try derive(password, &salt, 1024, prf, .{});
            defer std.crypto.secureZero(u8, &key);
            try std.testing.expectEqualSlices(u8, &reference, &key);
        }
    }
    const exact: Limits = .{ .max_password_bytes = 6, .max_salt_bytes = 16, .max_iterations = 1024 };
    var exact_key = try derive("123456", &salt, 1024, .sha1, exact);
    defer std.crypto.secureZero(u8, &exact_key);
    try std.testing.expectError(error.LimitExceeded, derive("1234567", &salt, 1024, .sha1, exact));
    try std.testing.expectError(error.LimitExceeded, derive("123456", &salt, 1025, .sha1, exact));
    try std.testing.expectError(error.LimitExceeded, derive("123456", &salt, 1024, .sha1, .{ .max_salt_bytes = 15 }));
    try std.testing.expectError(error.InvalidKeyParameters, derive("123456", &salt, 0, .sha1, .{}));
    try std.testing.expectError(error.InvalidKeyParameters, derive("123456", "", 1024, .sha1, .{}));
}

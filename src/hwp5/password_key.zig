//! Observed EncryptVersion 4 key derivation; no support for version 0 implied.
const std = @import("std");
pub fn derive(password: []const u8, max_password_bytes: usize) ![16]u8 {
    if (password.len > max_password_bytes) return error.LimitExceeded;
    var hash = std.crypto.hash.Sha1.init(.{});
    var previous: u8 = 0xec;
    for (password) |byte| {
        var pair = [_]u8{ std.math.rotl(u8, previous, 1), byte };
        hash.update(&pair);
        std.crypto.secureZero(u8, &pair);
        previous = byte;
    }
    var digest: [20]u8 = undefined;
    hash.final(&digest);
    defer std.crypto.secureZero(u8, &digest);
    return digest[0..16].*;
}
test "HWP5 password key independent Node vectors exact bytes and limit" {
    const passwords = [_][]const u8{ "helloworld", "123456", "한글\x00😀", "" };
    const references = [_][]const u8{ "207ae2ca4cd87fcf0d01569d8c14715a", "4471ba5269ac43d4917f7e442f9b22fc", "f11dab910e7603ce63e537ff3ceff269", "da39a3ee5e6b4b0d3255bfef95601890" };
    for (passwords, references) |password, reference| {
        var expected: [16]u8 = undefined;
        _ = try std.fmt.hexToBytes(&expected, reference);
        var key = try derive(password, password.len);
        defer std.crypto.secureZero(u8, &key);
        try std.testing.expectEqualSlices(u8, &expected, &key);
    }
    try std.testing.expectError(error.LimitExceeded, derive("123456", 5));
}

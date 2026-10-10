//! Block-only CBC primitive. No padding removal or authenticity assertion.
const std = @import("std");

fn hex(comptime value: []const u8) [value.len / 2]u8 {
    comptime {
        if (value.len % 2 != 0) @compileError("hex fixture must contain complete bytes");
    }
    var bytes: [value.len / 2]u8 = undefined;
    _ = std.fmt.hexToBytes(&bytes, value) catch unreachable;
    return bytes;
}

/// Separate buffers only. Reject every shape error before modifying output.
pub fn decrypt(key: [32]u8, iv: [16]u8, ciphertext: []const u8, output: []u8) !void {
    if (ciphertext.len == 0 or ciphertext.len % 16 != 0) return error.InvalidCiphertextLength;
    try @import("separate_buffers.zig").validate(ciphertext, output);
    const cipher = std.crypto.core.aes.Aes256.initDec(key);
    var previous = iv;
    var offset: usize = 0;
    while (offset < ciphertext.len) : (offset += 16) {
        const block = ciphertext[offset..][0..16];
        cipher.decrypt(output[offset..][0..16], block);
        for (output[offset..][0..16], previous) |*byte, prior| byte.* ^= prior;
        previous = block.*;
    }
}

test "AES256 CBC NIST four blocks and invalid buffers" {
    const key = hex("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4");
    const iv = hex("000102030405060708090a0b0c0d0e0f");
    const ciphertext = hex("f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d39f23369a9d9bacfa530e26304231461b2eb05e2c39be9fcda6c19078c6a9d1b");
    const expected = hex("6bc1bee22e409f96e93d7e117393172a" ++ "ae2d8a571e03ac9c9eb76fac45af8e51" ++ "30c81c46a35ce411e5fbc1191a0a52ef" ++ "f69f2445df4f9b17ad2b417be66c3710");
    var output: [64]u8 = undefined;
    try decrypt(key[0..32].*, iv[0..16].*, &ciphertext, &output);
    try std.testing.expectEqualSlices(u8, &expected, &output);
    output = @splat(0xaa);
    try std.testing.expectError(error.InvalidCiphertextLength, decrypt(key[0..32].*, iv[0..16].*, ciphertext[0..0], output[0..0]));
    for (1..64) |length| {
        if (length % 16 != 0) try std.testing.expectError(error.InvalidCiphertextLength, decrypt(key[0..32].*, iv[0..16].*, ciphertext[0..length], output[0..length]));
    }
    try std.testing.expectError(error.InvalidOutputLength, decrypt(key[0..32].*, iv[0..16].*, &ciphertext, output[0..32]));
    try std.testing.expectEqualSlices(u8, &([_]u8{0xaa} ** 64), &output);
    try std.testing.expectError(error.OverlappingBuffers, decrypt(key[0..32].*, iv[0..16].*, &output, &output));
    try std.testing.expectError(error.OverlappingBuffers, decrypt(key[0..32].*, iv[0..16].*, output[0..32], output[16..48]));
    try std.testing.expectError(error.OverlappingBuffers, decrypt(key[0..32].*, iv[0..16].*, output[16..48], output[0..32]));
    try std.testing.expectEqualSlices(u8, &([_]u8{0xaa} ** 64), &output);
}

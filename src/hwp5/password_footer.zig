const std = @import("std");

pub const BlockSize = enum(u8) { des = 8, aes = 16 };

/// Observed shared footer, outside the encrypted payload.
/// CRC32 detects accidental corruption; it is not cryptographic authentication.
pub fn payload(cipher: []const u8) ![]const u8 {
    return payloadFor(cipher, .aes);
}

pub fn payloadFor(cipher: []const u8, block_size: BlockSize) ![]const u8 {
    if (cipher.len < 8) return error.UnexpectedEnd;
    const end = cipher.len - 8;
    if (!std.mem.eql(u8, cipher[end..][0..4], &.{ 0x38, 0xa4, 0xce, 0x59 })) return error.InvalidPasswordFooter;
    if (end == 0 or end % @backingInt(block_size) != 0) return error.InvalidPasswordPayloadLength;
    return cipher[0..end];
}

pub fn validate(cipher: []const u8, decrypted_payload: []const u8) !void {
    return validateFor(cipher, decrypted_payload, .aes);
}

pub fn validateFor(cipher: []const u8, decrypted_payload: []const u8, block_size: BlockSize) !void {
    const encrypted = try payloadFor(cipher, block_size);
    if (encrypted.len != decrypted_payload.len) return error.InvalidPasswordPayloadLength;
    const expected = std.mem.readInt(u32, cipher[cipher.len - 4 ..][0..4], .little);
    if (expected != std.hash.Crc32.hash(decrypted_payload)) return error.InvalidChecksum;
}

test "password footer DES boundary is explicit and retains strict AES default" {
    const plain: [8]u8 = @splat(0x11);
    var cipher: [16]u8 = @splat(0);
    @memcpy(cipher[8..12], &[_]u8{ 0x38, 0xa4, 0xce, 0x59 });
    std.mem.writeInt(u32, cipher[12..16], std.hash.Crc32.hash(&plain), .little);
    try validateFor(&cipher, &plain, .des);
    try std.testing.expectEqual(@as(usize, 8), (try payloadFor(&cipher, .des)).len);
    try std.testing.expectError(error.InvalidPasswordPayloadLength, payload(&cipher));
    for (8..16) |index| {
        cipher[index] ^= 1;
        try std.testing.expectError(if (index < 12) error.InvalidPasswordFooter else error.InvalidChecksum, validateFor(&cipher, &plain, .des));
        cipher[index] ^= 1;
    }
    try std.testing.expectError(error.InvalidPasswordPayloadLength, validateFor(&cipher, plain[0..7], .des));
    try std.testing.expectError(error.InvalidPasswordPayloadLength, payloadFor(cipher[1..], .des));
}

test "HWP5 password footer rejects each marker checksum mutation and invalid lengths" {
    const plain: [16]u8 = @splat(0x61);
    var cipher: [24]u8 = @splat(0);
    @memcpy(cipher[16..20], &[_]u8{ 0x38, 0xa4, 0xce, 0x59 });
    std.mem.writeInt(u32, cipher[20..24], std.hash.Crc32.hash(&plain), .little);
    try validate(&cipher, &plain);
    try std.testing.expectEqual(@as(usize, 16), (try payload(&cipher)).len);
    for (16..24) |index| {
        cipher[index] ^= 1;
        try std.testing.expectError(if (index < 20) error.InvalidPasswordFooter else error.InvalidChecksum, validate(&cipher, &plain));
        cipher[index] ^= 1;
    }
    var changed = plain;
    for (0..changed.len) |index| {
        changed[index] ^= 1;
        try std.testing.expectError(error.InvalidChecksum, validate(&cipher, &changed));
        changed[index] ^= 1;
    }
    for (0..8) |len| try std.testing.expectError(error.UnexpectedEnd, payload(cipher[0..len]));
    try std.testing.expectError(error.InvalidPasswordPayloadLength, payload(cipher[16..]));
    try std.testing.expectError(error.InvalidPasswordPayloadLength, payload(cipher[1..]));
    try std.testing.expectError(error.InvalidPasswordPayloadLength, validate(&cipher, plain[0..15]));
    try std.testing.expectEqualSlices(u8, &plain, &changed);
}

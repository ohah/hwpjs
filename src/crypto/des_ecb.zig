//! Block-only legacy ECB decryption. No padding or document semantics.
const std = @import("std");
const block = @import("des/root.zig");

pub fn decrypt(key: [8]u8, ciphertext: []const u8, output: []u8) !void {
    if (ciphertext.len == 0 or ciphertext.len % 8 != 0) return error.InvalidCiphertextLength;
    try @import("separate_buffers.zig").validate(ciphertext, output);
    var offset: usize = 0;
    while (offset < ciphertext.len) : (offset += 8) {
        output[offset..][0..8].* = block.decryptBlock(key, ciphertext[offset..][0..8].*);
    }
}

test "legacy DES ECB separate buffers preserve output on every preflight refusal" {
    var key: [8]u8 = undefined;
    var cipher: [8]u8 = undefined;
    var plain: [8]u8 = undefined;
    _ = try std.fmt.hexToBytes(&key, "133457799bbcdff1");
    _ = try std.fmt.hexToBytes(&cipher, "85e813540f0ab405");
    _ = try std.fmt.hexToBytes(&plain, "0123456789abcdef");
    var input: [16]u8 = undefined;
    @memcpy(input[0..8], &cipher);
    @memcpy(input[8..16], &cipher);
    const original = input;
    var output: [16]u8 = @splat(0xaa);
    try decrypt(key, &input, &output);
    try std.testing.expectEqualSlices(u8, &plain, output[0..8]);
    try std.testing.expectEqualSlices(u8, &plain, output[8..16]);
    try std.testing.expectEqualSlices(u8, &original, &input);
    output = @splat(0xaa);
    const untouched = output;
    try std.testing.expectError(error.InvalidCiphertextLength, decrypt(key, &.{}, output[0..0]));
    for (1..16) |length| if (length % 8 != 0) {
        try std.testing.expectError(error.InvalidCiphertextLength, decrypt(key, input[0..length], output[0..length]));
    };
    try std.testing.expectError(error.InvalidOutputLength, decrypt(key, &input, output[0..15]));
    try std.testing.expectEqualSlices(u8, &untouched, &output);
    var overlapping: [24]u8 = @splat(0xbb);
    const before = overlapping;
    try std.testing.expectError(error.OverlappingBuffers, decrypt(key, overlapping[0..16], overlapping[8..24]));
    try std.testing.expectError(error.OverlappingBuffers, decrypt(key, overlapping[8..24], overlapping[0..16]));
    try std.testing.expectError(error.OverlappingBuffers, decrypt(key, overlapping[0..16], overlapping[0..16]));
    try std.testing.expectEqualSlices(u8, &before, &overlapping);
    @memcpy(overlapping[0..8], &cipher);
    try decrypt(key, overlapping[0..8], overlapping[8..16]);
    try std.testing.expectEqualSlices(u8, &cipher, overlapping[0..8]);
    try std.testing.expectEqualSlices(u8, &plain, overlapping[8..16]);
}

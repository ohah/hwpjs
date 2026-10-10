//! Bit-feedback CFB with explicit IV. No padding or authenticity semantics.
const std = @import("std");
pub const Mode = enum { encrypt, decrypt };
pub fn transform(key: [16]u8, iv: [16]u8, input: []const u8, output: []u8, mode: Mode) !void {
    try @import("separate_buffers.zig").validate(input, output);
    const aes = std.crypto.core.aes.Aes128.initEnc(key);
    var register = iv;
    defer std.crypto.secureZero(u8, &register);
    var block: [16]u8 = undefined;
    defer std.crypto.secureZero(u8, &block);
    for (input, output) |byte, *result| {
        result.* = 0;
        for (0..8) |bit| {
            aes.encrypt(&block, &register);
            const shift: u3 = @intCast(7 - bit);
            const current: u8 = (byte >> shift) & 1;
            const transformed = current ^ (block[0] >> 7);
            result.* |= transformed << shift;
            const feedback = if (mode == .encrypt) transformed else current;
            const value = (std.mem.readInt(u128, &register, .big) << 1) | @as(u128, feedback);
            std.mem.writeInt(u128, &register, value, .big);
        }
    }
}

test "AES128 CFB1 matches independent Node and preserves every partial byte length" {
    var key: [16]u8 = undefined;
    _ = try std.fmt.hexToBytes(&key, "207ae2ca4cd87fcf0d01569d8c14715a");
    var expected: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&expected, "00013eec903dbc26faff9c6cfb354800bcaa147b0ed15c32211737fa971de379");
    var input: [32]u8 = undefined;
    for (&input, 0..) |*byte, i| byte.* = @intCast(i);
    var output: [32]u8 = undefined;
    const iv = [_]u8{0} ** 16;
    for (0..33) |length| {
        try transform(key, iv, input[0..length], output[0..length], .decrypt);
        try std.testing.expectEqualSlices(u8, expected[0..length], output[0..length]);
        var reversed: [32]u8 = undefined;
        try transform(key, iv, output[0..length], reversed[0..length], .encrypt);
        try std.testing.expectEqualSlices(u8, input[0..length], reversed[0..length]);
    }
    output = @splat(0xaa);
    var nonzero_iv: [16]u8 = undefined;
    for (&nonzero_iv, 0..) |*byte, i| byte.* = @intCast(i);
    var nonzero_expected: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&nonzero_expected, "a8e3303e0c47869a64ef3adf4bfe1367bcaa147b0ed15c32211737fa971de379");
    try transform(key, nonzero_iv, &input, &output, .decrypt);
    try std.testing.expectEqualSlices(u8, &nonzero_expected, &output);
    output = @splat(0xaa);
    try std.testing.expectError(error.InvalidOutputLength, transform(key, iv, &input, output[0..31], .decrypt));
    try std.testing.expectError(error.OverlappingBuffers, transform(key, iv, &output, &output, .decrypt));
    try std.testing.expectError(error.OverlappingBuffers, transform(key, iv, output[0..16], output[8..24], .encrypt));
    try std.testing.expectError(error.OverlappingBuffers, transform(key, iv, output[8..24], output[0..16], .decrypt));
    try std.testing.expectEqualSlices(u8, &([_]u8{0xaa} ** 32), &output);
}

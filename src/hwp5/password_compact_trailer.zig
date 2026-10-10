//! Observed legacy envelope: DEFLATE, CRC32, size, then zero alignment.
const std = @import("std");

pub fn validate(raw: []const u8, consumed: usize, plain: []const u8) !void {
    const end = std.math.add(usize, consumed, 8) catch return error.InvalidPasswordTrailer;
    if (end > raw.len) return error.InvalidPasswordTrailer;
    const padding = (8 - end % 8) % 8;
    if (raw.len - end != padding) return error.InvalidPasswordTrailer;
    if (!std.mem.allEqual(u8, raw[end..], 0)) return error.InvalidPadding;
    if (std.mem.readInt(u32, raw[consumed..][0..4], .little) != std.hash.Crc32.hash(plain)) return error.InvalidChecksum;
    const size = std.math.cast(u32, plain.len) orelse return error.InvalidLength;
    if (std.mem.readInt(u32, raw[consumed + 4 ..][0..4], .little) != size) return error.InvalidLength;
}

test "legacy compact trailer exact boundaries CRC size padding and overflow" {
    const plain = "plain😀";
    for (0..16) |consumed| {
        var raw: [32]u8 = @splat(0);
        @memset(raw[0..consumed], 0xbe);
        const end = consumed + 8;
        const total = end + (8 - end % 8) % 8;
        std.mem.writeInt(u32, raw[consumed..][0..4], std.hash.Crc32.hash(plain), .little);
        std.mem.writeInt(u32, raw[consumed + 4 ..][0..4], plain.len, .little);
        try validate(raw[0..total], consumed, plain);
        for (consumed..total) |index| {
            raw[index] ^= 1;
            try std.testing.expectError(if (index < consumed + 4) error.InvalidChecksum else if (index < end) error.InvalidLength else error.InvalidPadding, validate(raw[0..total], consumed, plain));
            raw[index] ^= 1;
        }
        try std.testing.expectError(error.InvalidPasswordTrailer, validate(raw[0 .. total - 1], consumed, plain));
        try std.testing.expectError(error.InvalidPasswordTrailer, validate(raw[0 .. total + 1], consumed, plain));
        try std.testing.expectError(error.InvalidChecksum, validate(raw[0..total], consumed, "changed"));
    }
    try std.testing.expectError(error.InvalidPasswordTrailer, validate(&.{}, std.math.maxInt(usize), plain));
    try std.testing.expectError(error.InvalidPasswordTrailer, validate(&.{}, 0, plain));
}

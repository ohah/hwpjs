const std = @import("std");
pub const Layout = enum { compact, aligned_blocks };
/// Observed: raw deflate, zero alignment to 16, CRC32 block, ISIZE block.
/// Or adjacent CRC32/ISIZE DWORDs followed by AES zero alignment.
/// The separate checksum blocks each contain a DWORD and twelve zero bytes.
pub fn validate(plain: []const u8, consumed: usize, output: []const u8) !void {
    _ = try inspect(plain, consumed, output);
}

pub fn inspect(plain: []const u8, consumed: usize, output: []const u8) !Layout {
    if (consumed > plain.len) return error.UnexpectedEnd;
    const tail = plain[consumed..];
    const padding = (16 - consumed % 16) % 16;
    // Observed viewtext.hwp: adjacent CRC32/ISIZE DWORDs immediately
    // after DEFLATE, followed by zero AES block alignment.
    const compact_padding = (16 - (consumed % 16 + 8) % 16) % 16;
    if (tail.len == 8 + compact_padding) {
        if (!std.mem.allEqual(u8, tail[8..], 0)) return error.InvalidDistributionPadding;
        if (std.mem.readInt(u32, tail[0..4], .little) != std.hash.Crc32.hash(output) or std.mem.readInt(u32, tail[4..8], .little) != @as(u32, @truncate(output.len))) return error.InvalidChecksum;
        return .compact;
    }
    if (tail.len != padding + 32) return error.TrailingData;
    const check = tail[padding..];
    if (!std.mem.allEqual(u8, tail[0..padding], 0) or !std.mem.allEqual(u8, check[4..16], 0) or !std.mem.allEqual(u8, check[20..32], 0)) return error.InvalidDistributionPadding;
    if (std.mem.readInt(u32, check[0..4], .little) != std.hash.Crc32.hash(output) or std.mem.readInt(u32, check[16..20], .little) != @as(u32, @truncate(output.len))) return error.InvalidChecksum;
    return .aligned_blocks;
}

test "distribution compact trailer validates all alignments checksums and every padding byte" {
    for (0..16) |consumed| {
        var plain: [32]u8 = @splat(0);
        const length = consumed + 8 + (16 - (consumed + 8) % 16) % 16;
        std.mem.writeInt(u32, plain[consumed..][0..4], std.hash.Crc32.hash("A"), .little);
        std.mem.writeInt(u32, plain[consumed + 4 ..][0..4], 1, .little);
        try validate(plain[0..length], consumed, "A");
        for (consumed..length) |index| {
            plain[index] ^= 1;
            try std.testing.expectError(if (index < consumed + 8) error.InvalidChecksum else error.InvalidDistributionPadding, validate(plain[0..length], consumed, "A"));
            plain[index] ^= 1;
        }
        try std.testing.expectError(error.TrailingData, validate(plain[0 .. length - 1], consumed, "A"));
    }
}

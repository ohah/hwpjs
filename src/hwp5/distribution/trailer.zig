const std = @import("std");
/// Observed: raw deflate, zero alignment to 16, CRC32 block, ISIZE block.
/// The last two blocks each contain a little-endian DWORD and twelve zero bytes.
pub fn validate(plain: []const u8, consumed: usize, output: []const u8) !void {
    if (consumed > plain.len) return error.UnexpectedEnd;
    const tail = plain[consumed..];
    const padding = (16 - consumed % 16) % 16;
    if (tail.len != padding + 32) return error.TrailingData;
    const check = tail[padding..];
    if (!std.mem.allEqual(u8, tail[0..padding], 0) or !std.mem.allEqual(u8, check[4..16], 0) or !std.mem.allEqual(u8, check[20..32], 0)) return error.InvalidDistributionPadding;
    if (std.mem.readInt(u32, check[0..4], .little) != std.hash.Crc32.hash(output) or std.mem.readInt(u32, check[16..20], .little) != @as(u32, @truncate(output.len))) return error.InvalidChecksum;
}

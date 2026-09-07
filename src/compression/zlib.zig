const std = @import("std");
const raw = @import("raw_deflate.zig");

/// RFC1950 CM=8 without preset dictionaries (the PNG compression profile).
/// Exactly one stream; caller owns output. No raw/gzip fallback.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, max_output: usize) ![]u8 {
    const result = try decodePrefix(a, bytes, max_output);
    errdefer a.free(result.bytes);
    if (result.consumed != bytes.len) return error.TrailingData;
    return result.bytes;
}

pub const Result = struct { bytes: []u8, consumed: usize };
/// Validates one complete stream, leaving enclosing-format trailing policy to caller.
pub fn decodePrefix(a: std.mem.Allocator, bytes: []const u8, max_output: usize) !Result {
    if (bytes.len < 2) return error.UnexpectedEnd;
    const cmf = bytes[0];
    const flg = bytes[1];
    if (cmf & 15 != 8 or cmf >> 4 > 7 or std.mem.readInt(u16, bytes[0..2], .big) % 31 != 0)
        return error.InvalidZlibHeader;
    if (flg & 32 != 0) return error.UnsupportedZlibDictionary;
    const shift: u4 = @intCast((cmf >> 4) + 8);
    const result = try raw.decodePrefixWindow(a, bytes[2..], max_output, @as(u16, 1) << shift);
    errdefer a.free(result.bytes);
    const tail = bytes[2 + result.consumed ..];
    if (tail.len < 4) return error.UnexpectedEnd;
    if (std.hash.Adler32.hash(result.bytes) != std.mem.readInt(u32, tail[0..4], .big))
        return error.InvalidChecksum;
    return .{ .bytes = result.bytes, .consumed = 2 + result.consumed + 4 };
}

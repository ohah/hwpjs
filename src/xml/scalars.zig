const std = @import("std");
pub const Encoding = enum { utf8, utf16le, utf16be };
pub const Scalar = struct { value: u21, start: usize, end: usize };
/// Strict Unicode only; no XML character policy, BOM stripping or normalization.
pub fn read(bytes: []const u8, offset: usize, encoding: Encoding) !?Scalar {
    if (offset > bytes.len) return error.UnexpectedEnd;
    if (offset == bytes.len) return null;
    const rest = bytes[offset..];
    if (encoding == .utf8) {
        const n = std.unicode.utf8ByteSequenceLength(rest[0]) catch return error.InvalidXmlEncoding;
        if (n > rest.len) return error.UnexpectedEnd;
        const c = std.unicode.utf8Decode(rest[0..n]) catch return error.InvalidXmlEncoding;
        return .{ .value = c, .start = offset, .end = offset + n };
    }
    if (rest.len < 2) return error.UnexpectedEnd;
    const order: std.builtin.Endian = if (encoding == .utf16le) .little else .big;
    const first = std.mem.readInt(u16, rest[0..2], order);
    if (first >= 0xdc00 and first <= 0xdfff) return error.InvalidXmlEncoding;
    if (first < 0xd800 or first > 0xdbff) return .{ .value = first, .start = offset, .end = offset + 2 };
    if (rest.len < 4) return error.UnexpectedEnd;
    const second = std.mem.readInt(u16, rest[2..4], order);
    if (second < 0xdc00 or second > 0xdfff) return error.InvalidXmlEncoding;
    return .{ .value = 0x10000 + (@as(u21, first - 0xd800) << 10) + (second - 0xdc00), .start = offset, .end = offset + 4 };
}

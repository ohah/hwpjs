const keyword = @import("keyword.zig");
pub const Value = struct { keyword: []const u8, text: []const u8 };
/// Printable Latin-1 plus LF, as specified for tEXt/zTXt in PNG Third Edition.
pub fn validateLatin1(bytes: []const u8) !void {
    for (bytes) |b| {
        if (b == 0) return error.InvalidPngTextNull;
        if (!(b == 10 or (b >= 32 and b <= 126) or b >= 160)) return error.UnsupportedPngTextCharacter;
    }
}
/// Non-owning, uncompressed tEXt payload. No normalization or keyword dispatch.
pub fn parse(bytes: []const u8) !Value {
    const prefix = try keyword.split(bytes);
    try validateLatin1(prefix.remaining);
    return .{ .keyword = prefix.keyword, .text = prefix.remaining };
}

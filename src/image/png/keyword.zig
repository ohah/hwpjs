const std = @import("std");
pub const Prefix = struct { keyword: []const u8, remaining: []const u8 };
pub fn validate(bytes: []const u8) !void {
    if (bytes.len == 0 or bytes.len > 79) return error.InvalidPngKeywordSize;
    if (bytes[0] == 32 or bytes[bytes.len - 1] == 32) return error.InvalidPngKeywordSpace;
    var space = false;
    for (bytes) |b| {
        if (!((b >= 32 and b <= 126) or b >= 161)) return error.InvalidPngKeywordCharacter;
        if (b == 32 and space) return error.InvalidPngKeywordSpace;
        space = b == 32;
    }
}
/// Bounded separator search. Both returned slices borrow the payload.
pub fn split(bytes: []const u8) !Prefix {
    const end = std.mem.indexOfScalar(u8, bytes[0..@min(bytes.len, 80)], 0) orelse return error.MissingPngKeywordSeparator;
    try validate(bytes[0..end]);
    return .{ .keyword = bytes[0..end], .remaining = bytes[end + 1 ..] };
}

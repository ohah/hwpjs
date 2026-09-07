const std = @import("std");
const keyword = @import("keyword.zig");
pub const Header = struct { keyword: []const u8, language: []const u8, translated: []const u8, body: []const u8, compressed: bool, method: u8 };
/// All slices borrow the original chunk. Only body may be compressed.
pub fn parse(bytes: []const u8, max_language_bytes: usize) !Header {
    const prefix = try keyword.split(bytes);
    const rest = prefix.remaining;
    if (rest.len < 2) return error.MissingPngInternationalCompression;
    if (rest[0] > 1) return error.InvalidPngInternationalCompressionFlag;
    if (rest[0] == 1 and rest[1] != 0) return error.UnsupportedPngTextCompressionMethod;
    const fields = rest[2..];
    const bound = @min(fields.len, max_language_bytes +| 1);
    const lang_end = std.mem.indexOfScalar(u8, fields[0..bound], 0) orelse {
        if (fields.len > max_language_bytes) return error.LimitExceeded;
        return error.MissingPngLanguageSeparator;
    };
    const translated = fields[lang_end + 1 ..];
    const translated_end = std.mem.indexOfScalar(u8, translated, 0) orelse return error.MissingPngTranslatedSeparator;
    return .{ .keyword = prefix.keyword, .language = fields[0..lang_end], .translated = translated[0..translated_end], .body = translated[translated_end + 1 ..], .compressed = rest[0] == 1, .method = rest[1] };
}

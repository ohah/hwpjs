const std = @import("std");
// Fixed identifiers from RFC 5646 section 2.1; not a live registry snapshot.
pub const tags = [_][]const u8{
    "en-GB-oed", "i-ami", "i-bnn", "i-default", "i-enochian", "i-hak", "i-klingon", "i-lux", "i-mingo", "i-navajo", "i-pwn", "i-tao", "i-tay", "i-tsu", "sgn-BE-FR", "sgn-BE-NL", "sgn-CH-DE", "art-lojban", "cel-gaulish", "no-bok", "no-nyn", "zh-guoyu", "zh-hakka", "zh-min", "zh-min-nan", "zh-xiang",
};
pub fn contains(bytes: []const u8) bool {
    for (tags) |tag| if (std.ascii.eqlIgnoreCase(bytes, tag)) return true;
    return false;
}

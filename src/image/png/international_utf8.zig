const std = @import("std");
pub const Report = struct { discouraged_controls: usize = 0, linefeeds: usize = 0 };
/// PNG iTXt UTF-8, not XML character rules or the Latin-1 tEXt profile.
pub fn inspect(bytes: []const u8) !Report {
    var r: Report = .{};
    var at: usize = 0;
    while (at < bytes.len) {
        const n = std.unicode.utf8ByteSequenceLength(bytes[at]) catch return error.InvalidPngInternationalUtf8;
        if (n > bytes.len - at) return error.InvalidPngInternationalUtf8;
        const c = std.unicode.utf8Decode(bytes[at..][0..n]) catch return error.InvalidPngInternationalUtf8;
        if (c == 0) return error.InvalidPngTextNull;
        if (c == 10) r.linefeeds += 1 else if (c < 32 or (c >= 127 and c <= 159)) r.discouraged_controls += 1;
        at += n;
    }
    return r;
}

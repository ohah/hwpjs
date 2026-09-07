const std = @import("std");
const Options = @import("types.zig").Options;
pub fn alpha(bytes: []const u8) bool {
    for (bytes) |b| if (!std.ascii.isAlphabetic(b)) return false;
    return true;
}
pub fn digits(bytes: []const u8) bool {
    for (bytes) |b| if (!std.ascii.isDigit(b)) return false;
    return true;
}
pub const Token = struct { bytes: []const u8, start: usize, end: usize };
pub const Cursor = struct {
    bytes: []const u8,
    offset: usize = 0,
    last_end: usize = 0,
    count: usize,
    pub fn init(bytes: []const u8, options: Options) !Cursor {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        if (bytes.len == 0) return error.InvalidLanguageTag;
        var len: usize = 0;
        var count: usize = 1;
        for (bytes) |b| {
            if (b == '-') {
                if (len == 0) return error.InvalidLanguageTag;
                len = 0;
                count += 1;
            } else {
                if (!std.ascii.isAlphanumeric(b)) return error.InvalidLanguageTag;
                len += 1;
                if (len > 8) return error.InvalidLanguageTag;
            }
            if (count > options.max_subtags) return error.LimitExceeded;
        }
        if (len == 0) return error.InvalidLanguageTag;
        return .{ .bytes = bytes, .count = count };
    }
    pub fn next(self: *Cursor) ?Token {
        if (self.offset >= self.bytes.len) return null;
        const start = self.offset;
        const len = std.mem.indexOfScalar(u8, self.bytes[start..], '-') orelse self.bytes.len - start;
        self.last_end = start + len;
        self.offset = self.last_end + @intFromBool(self.last_end < self.bytes.len);
        return .{ .bytes = self.bytes[start..self.last_end], .start = start, .end = self.last_end };
    }
    pub fn peek(self: Cursor) ?Token {
        var copy = self;
        return copy.next();
    }
};

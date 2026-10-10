const std = @import("std");
pub fn validate(name: []const u8, limit: usize) !void {
    if (name.len == 0 or !std.unicode.utf8ValidateSlice(name)) return error.InvalidFontName;
    if (name.len > limit) return error.LimitExceeded;
}

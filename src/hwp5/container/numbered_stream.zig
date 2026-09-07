const std = @import("std");
/// CFB ASCII prefixes are case-insensitive; suffixes are canonical unsigned decimal.
pub fn index(comptime T: type, comptime prefix: []const u8, name: []const u8) !?T {
    if (!std.ascii.startsWithIgnoreCase(name, prefix)) return null;
    const digits = name[prefix.len..];
    if (digits.len == 0 or (digits.len > 1 and digits[0] == '0')) return error.InvalidNumberedStreamName;
    var n: T = 0;
    for (digits) |c| {
        if (c < '0' or c > '9') return error.InvalidNumberedStreamName;
        n = std.math.mul(T, n, 10) catch return error.InvalidNumberedStreamName;
        n = std.math.add(T, n, @intCast(c - '0')) catch return error.InvalidNumberedStreamName;
    }
    return n;
}

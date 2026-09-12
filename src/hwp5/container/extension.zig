const std = @import("std");

/// Format hint only. UTF-16 validity and CFB path rules belong to paths.zig.
/// The expected extension is lower-case ASCII.
pub fn is(bytes: []const u8, ascii: []const u8) bool {
    if (bytes.len % 2 != 0 or bytes.len / 2 != ascii.len) return false;
    for (ascii, 0..) |c, i| {
        if (bytes[2 * i + 1] != 0 or std.ascii.toLower(bytes[2 * i]) != c) return false;
    }
    return true;
}

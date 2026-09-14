const std = @import("std");
const utf16 = @import("../../text/utf16.zig");

pub const String = struct {
    /// Borrowed UTF-16LE bytes before the first NUL, or the complete fixed field.
    value: []const u8,
    storage: []const u8,
    terminated: bool,
};

pub fn parse(storage: []const u8) !String {
    if (storage.len % 2 != 0) return error.InvalidEmfFontStringSize;
    var end = storage.len;
    var terminated = false;
    var offset: usize = 0;
    while (offset < storage.len) : (offset += 2) {
        if (std.mem.readInt(u16, storage[offset..][0..2], .little) == 0) {
            end = offset;
            terminated = true;
            break;
        }
    }
    _ = utf16.inspect(storage[0..end], .little) catch return error.InvalidEmfFontStringEncoding;
    return .{ .value = storage[0..end], .storage = storage, .terminated = terminated };
}

test "fixed font string validates only text through first NUL and preserves storage" {
    var bytes = [_]u8{ 0x3d, 0xd8, 0, 0xde, 0, 0, 0, 0xd8 };
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(usize, 4), value.value.len);
    try std.testing.expect(value.terminated);
    try std.testing.expectEqual(@as(usize, 8), value.storage.len);
    bytes[2] = 0;
    bytes[3] = 0;
    try std.testing.expectError(error.InvalidEmfFontStringEncoding, parse(&bytes));
    try std.testing.expectError(error.InvalidEmfFontStringSize, parse(bytes[0..7]));

    var unterminated = [_]u8{ 'A', 0, 0, 0xd8 };
    try std.testing.expectError(error.InvalidEmfFontStringEncoding, parse(&unterminated));
}

pub const Entry = struct {
    reserved: u8,
    blue: u8,
    green: u8,
    red: u8,
};

pub fn parse(bytes: []const u8) !Entry {
    if (bytes.len != 4) return error.InvalidEmfLogPaletteEntrySize;
    return .{
        .reserved = bytes[0],
        .blue = bytes[1],
        .green = bytes[2],
        .red = bytes[3],
    };
}

test "LogPaletteEntry preserves reserved-blue-green-red wire order" {
    const std = @import("std");
    const value = try parse(&.{ 9, 30, 20, 10 });
    try std.testing.expectEqual(@as(u8, 9), value.reserved);
    try std.testing.expectEqual(@as(u8, 30), value.blue);
    try std.testing.expectEqual(@as(u8, 20), value.green);
    try std.testing.expectEqual(@as(u8, 10), value.red);
    try std.testing.expectError(error.InvalidEmfLogPaletteEntrySize, parse(&.{ 1, 2, 3 }));
}

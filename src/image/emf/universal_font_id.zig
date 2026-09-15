const std = @import("std");

pub const byte_size = 8;
pub const UniversalFontId = struct {
    checksum: u32,
    index: u32,
};

pub fn parse(bytes: []const u8) !UniversalFontId {
    if (bytes.len != byte_size) return error.InvalidEmfUniversalFontIdSize;
    return .{
        .checksum = std.mem.readInt(u32, bytes[0..4], .little),
        .index = std.mem.readInt(u32, bytes[4..8], .little),
    };
}

test "UniversalFontId preserves checksum classes and index" {
    for ([_]u32{ 0, 1, 2, 3, std.math.maxInt(u32) }) |checksum| {
        var bytes = [_]u8{0} ** byte_size;
        std.mem.writeInt(u32, bytes[0..4], checksum, .little);
        std.mem.writeInt(u32, bytes[4..8], 0x89abcdef, .little);
        const value = try parse(&bytes);
        try std.testing.expectEqual(checksum, value.checksum);
        try std.testing.expectEqual(@as(u32, 0x89abcdef), value.index);
    }
}

test "UniversalFontId requires exactly eight bytes" {
    const bytes = [_]u8{0} ** (byte_size + 1);
    try std.testing.expectError(error.InvalidEmfUniversalFontIdSize, parse(bytes[0 .. byte_size - 1]));
    try std.testing.expectError(error.InvalidEmfUniversalFontIdSize, parse(&bytes));
}

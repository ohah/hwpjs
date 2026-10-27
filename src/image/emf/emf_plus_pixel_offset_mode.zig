pub const PixelOffsetMode = enum(u8) {
    default = 0,
    high_speed = 1,
    high_quality = 2,
    none = 3,
    half = 4,

    pub fn parse(raw: u8) !PixelOffsetMode {
        if (raw > @backingInt(PixelOffsetMode.half)) return error.InvalidEmfPlusPixelOffsetMode;
        return @fromBackingInt(@intCast(raw));
    }
};

test "EMF+ PixelOffsetMode accepts exactly the official domain" {
    const std = @import("std");
    for (0..5) |raw|
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @backingInt(try PixelOffsetMode.parse(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusPixelOffsetMode, PixelOffsetMode.parse(5));
    try std.testing.expectError(error.InvalidEmfPlusPixelOffsetMode, PixelOffsetMode.parse(0xff));
}

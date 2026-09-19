pub const WrapMode = enum(u32) {
    tile = 0,
    tile_flip_x = 1,
    tile_flip_y = 2,
    tile_flip_xy = 3,
    clamp = 4,

    pub fn parse(raw: u32) !WrapMode {
        if (raw > @intFromEnum(WrapMode.clamp)) return error.InvalidEmfPlusWrapMode;
        return @enumFromInt(raw);
    }
};

test "EMF+ WrapMode accepts exactly the official domain" {
    const std = @import("std");
    for (0..5) |raw|
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try WrapMode.parse(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, WrapMode.parse(5));
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, WrapMode.parse(0xffff_ffff));
}

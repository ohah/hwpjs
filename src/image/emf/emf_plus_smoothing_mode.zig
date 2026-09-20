pub const SmoothingMode = enum(u7) {
    default = 0,
    high_speed = 1,
    high_quality = 2,
    none = 3,
    anti_alias_8x4 = 4,
    anti_alias_8x8 = 5,

    pub fn parse(raw: u8) !SmoothingMode {
        if (raw > @intFromEnum(SmoothingMode.anti_alias_8x8)) return error.InvalidEmfPlusSmoothingMode;
        return @enumFromInt(raw);
    }
};

test "EMF+ SmoothingMode accepts exactly the official domain" {
    const std = @import("std");
    for (0..6) |raw|
        try std.testing.expectEqual(@as(u7, @intCast(raw)), @intFromEnum(try SmoothingMode.parse(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusSmoothingMode, SmoothingMode.parse(6));
    try std.testing.expectError(error.InvalidEmfPlusSmoothingMode, SmoothingMode.parse(127));
    try std.testing.expectError(error.InvalidEmfPlusSmoothingMode, SmoothingMode.parse(255));
}

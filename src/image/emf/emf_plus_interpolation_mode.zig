pub const InterpolationMode = enum(u8) {
    default = 0,
    low_quality = 1,
    high_quality = 2,
    bilinear = 3,
    bicubic = 4,
    nearest_neighbor = 5,
    high_quality_bilinear = 6,
    high_quality_bicubic = 7,

    pub fn parse(raw: u8) !InterpolationMode {
        if (raw > @intFromEnum(InterpolationMode.high_quality_bicubic)) return error.InvalidEmfPlusInterpolationMode;
        return @enumFromInt(raw);
    }
};

test "EMF+ InterpolationMode accepts exactly the official domain" {
    const std = @import("std");
    for (0..8) |raw|
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(try InterpolationMode.parse(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusInterpolationMode, InterpolationMode.parse(8));
    try std.testing.expectError(error.InvalidEmfPlusInterpolationMode, InterpolationMode.parse(0xff));
}

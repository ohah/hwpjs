pub const FilterType = enum(u8) {
    none = 0,
    point = 1,
    linear = 2,
    triangle = 3,
    box = 4,
    pyramidal_quad = 6,
    gaussian_quad = 7,

    pub fn parse(raw: u8) !FilterType {
        return switch (raw) {
            0...4, 6, 7 => @enumFromInt(raw),
            else => error.InvalidEmfPlusFilterType,
        };
    }
};

test "EMF+ FilterType accepts exactly the official sparse domain" {
    const std = @import("std");
    for ([_]u8{ 0, 1, 2, 3, 4, 6, 7 }) |raw|
        try std.testing.expectEqual(raw, @intFromEnum(try FilterType.parse(raw)));
    try std.testing.expectError(error.InvalidEmfPlusFilterType, FilterType.parse(5));
    try std.testing.expectError(error.InvalidEmfPlusFilterType, FilterType.parse(8));
    try std.testing.expectError(error.InvalidEmfPlusFilterType, FilterType.parse(0xff));
}

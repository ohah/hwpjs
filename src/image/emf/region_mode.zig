const std = @import("std");

pub const RegionMode = enum(u32) {
    and_region = 1,
    or_region = 2,
    xor_region = 3,
    diff_region = 4,
    copy = 5,
};

pub fn parse(value: u32) !RegionMode {
    return std.enums.fromInt(RegionMode, value) orelse error.InvalidEmfRegionMode;
}

test "RegionMode accepts exactly the five specified values" {
    inline for (.{
        .{ @as(u32, 1), RegionMode.and_region },
        .{ @as(u32, 2), RegionMode.or_region },
        .{ @as(u32, 3), RegionMode.xor_region },
        .{ @as(u32, 4), RegionMode.diff_region },
        .{ @as(u32, 5), RegionMode.copy },
    }) |case| try std.testing.expectEqual(case[1], try parse(case[0]));
    for ([_]u32{ 0, 6, std.math.maxInt(u32) }) |value|
        try std.testing.expectError(error.InvalidEmfRegionMode, parse(value));
}

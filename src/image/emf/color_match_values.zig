const std = @import("std");

pub const Action = enum(u32) {
    enable = 0x00000001,
    disable = 0x00000002,
    delete_transform = 0x00000003,
};

pub const Target = enum(u32) {
    not_embedded = 0x00000000,
    embedded = 0x00000001,
};

pub fn action(value: u32) !Action {
    return std.enums.fromInt(Action, value) orelse error.InvalidEmfColorSpaceAction;
}

pub fn target(value: u32) !Target {
    return std.enums.fromInt(Target, value) orelse error.InvalidEmfColorMatchTarget;
}

test "color match action and target values are exact" {
    for ([_]u32{ 1, 2, 3 }) |value|
        try std.testing.expectEqual(value, @intFromEnum(try action(value)));
    for ([_]u32{ 0, 1 }) |value|
        try std.testing.expectEqual(value, @intFromEnum(try target(value)));
    for ([_]u32{ 0, 4, std.math.maxInt(u32) }) |value|
        try std.testing.expectError(error.InvalidEmfColorSpaceAction, action(value));
    for ([_]u32{ 2, 3, std.math.maxInt(u32) }) |value|
        try std.testing.expectError(error.InvalidEmfColorMatchTarget, target(value));
}

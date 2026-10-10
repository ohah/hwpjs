pub fn decode(kind: u32) !@import("../model/character_outline_kind.zig").Kind {
    return switch (kind) {
        0 => .none,
        1 => .solid,
        else => error.InvalidCharacterOutline,
    };
}
pub fn decodeHwp5(kind: u32) !@import("../model/character_outline_kind.zig").Kind {
    return switch (kind) {
        0 => .none,
        1 => .solid,
        2 => .dot,
        3 => .thick,
        4 => .dash,
        5 => .dash_dot,
        6 => .dash_dot_dot,
        else => error.InvalidCharacterOutline,
    };
}
test "extended HWP5 outline ABI preserves legacy decoder and rejects unknown seven" {
    const std = @import("std");
    for ([_]@import("../model/character_outline_kind.zig").Kind{ .none, .solid, .dot, .thick, .dash, .dash_dot, .dash_dot_dot }, 0..) |kind, code| try std.testing.expectEqual(kind, try decodeHwp5(@intCast(code)));
    for ([_]u32{ 7, 255, 0xffffffff }) |value| try std.testing.expectError(error.InvalidCharacterOutline, decodeHwp5(value));
    for (2..7) |value| try std.testing.expectError(error.InvalidCharacterOutline, decode(@intCast(value)));
}
test "outline ABI rejects unverified kind conversions" {
    const std = @import("std");
    try std.testing.expectEqual(.none, try decode(0));
    try std.testing.expectEqual(.solid, try decode(1));
    for ([_]u32{ 2, 7, 0xffffffff }) |value| try std.testing.expectError(error.InvalidCharacterOutline, decode(value));
}

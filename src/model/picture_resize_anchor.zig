const std = @import("std");

pub const Anchor = enum(u3) {
    top_left,
    top_center,
    top_right,
    center_left,
    center_right,
    bottom_left,
    bottom_center,
    bottom_right,
};

pub fn offsets(
    before: [2]i32,
    original: [2]u32,
    size: [2]u32,
    anchor: Anchor,
) error{ InvalidSize, NonIntegralOffset, OffsetOverflow }![2]i32 {
    if (size[0] == 0 or size[1] == 0) return error.InvalidSize;
    const halves: [2]i64 = switch (anchor) {
        .top_left => .{ 0, 0 },
        .top_center => .{ 1, 0 },
        .top_right => .{ 2, 0 },
        .center_left => .{ 0, 1 },
        .center_right => .{ 2, 1 },
        .bottom_left => .{ 0, 2 },
        .bottom_center => .{ 1, 2 },
        .bottom_right => .{ 2, 2 },
    };
    var result: [2]i32 = undefined;
    for (halves, 0..) |factor, axis| {
        const delta = (@as(i64, original[axis]) - @as(i64, size[axis])) * factor;
        if (@rem(delta, 2) != 0) return error.NonIntegralOffset;
        result[axis] = std.math.cast(i32, @as(i64, before[axis]) + @divExact(delta, 2)) orelse
            return error.OffsetOverflow;
    }
    return result;
}

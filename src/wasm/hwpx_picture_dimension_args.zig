const std = @import("std");
const Update = @import("../hwpx/picture_dimension_write.zig").Update;

pub fn parse(mask: u32, values: [6]u32) !Update {
    if (mask & ~@as(u32, 7) != 0) return error.InvalidPictureDimensionMask;
    for (0..3) |index| {
        if (mask & (@as(u32, 1) << @intCast(index)) == 0 and (values[index * 2] != 0 or values[index * 2 + 1] != 0)) return error.HiddenPictureDimensionValue;
    }
    return .{
        .display = if (mask & 1 != 0) .{ values[0], values[1] } else null,
        .original = if (mask & 2 != 0) .{ values[2], values[3] } else null,
        .current = if (mask & 4 != 0) .{ values[4], values[5] } else null,
    };
}

test "picture dimension ABI arguments preserve zero and reject hidden or unknown fields" {
    const update = try parse(5, .{ 12, 8, 0, 0, 0, 0 });
    try std.testing.expectEqualDeep(@as(?[2]u32, .{ 12, 8 }), update.display);
    try std.testing.expectEqualDeep(@as(?[2]u32, .{ 0, 0 }), update.current);
    try std.testing.expectEqual(@as(?[2]u32, null), update.original);
    try std.testing.expectError(error.InvalidPictureDimensionMask, parse(8, @splat(0)));
    try std.testing.expectError(error.HiddenPictureDimensionValue, parse(1, .{ 1, 1, 2, 0, 0, 0 }));
}

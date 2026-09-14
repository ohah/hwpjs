pub const Usage = enum(u32) { rgb_colors = 0, palette_colors = 1, palette_indices = 2 };

pub fn parse(raw: u32) !Usage {
    return switch (raw) {
        0 => .rgb_colors,
        1 => .palette_colors,
        2 => .palette_indices,
        else => error.UnsupportedEmfDibColors,
    };
}

test "DIB colors accepts exactly three protocol values" {
    const testing = @import("std").testing;
    try testing.expectEqual(Usage.rgb_colors, try parse(0));
    try testing.expectEqual(Usage.palette_colors, try parse(1));
    try testing.expectEqual(Usage.palette_indices, try parse(2));
    try testing.expectError(error.UnsupportedEmfDibColors, parse(3));
    try testing.expectError(error.UnsupportedEmfDibColors, parse(0xffffffff));
}

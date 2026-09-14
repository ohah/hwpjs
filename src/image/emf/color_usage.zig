pub const Usage = enum(u16) { rgb_colors = 0, palette_colors = 1, palette_indices = 2 };

pub fn parseLowWord(raw: u32) !Usage {
    return switch (@as(u16, @truncate(raw))) {
        0 => .rgb_colors,
        1 => .palette_colors,
        2 => .palette_indices,
        else => error.UnsupportedEmfColorUsage,
    };
}

test "color usage reads only the specified low word" {
    const testing = @import("std").testing;
    try testing.expectEqual(Usage.palette_indices, try parseLowWord(0xabcd0002));
    try testing.expectError(error.UnsupportedEmfColorUsage, parseLowWord(3));
}

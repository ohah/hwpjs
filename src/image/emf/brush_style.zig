pub const Style = enum(u32) {
    solid = 0,
    null = 1,
    hatched = 2,
    pattern = 3,
    indexed = 4,
    dib_pattern = 5,
    dib_pattern_pt = 6,
    pattern_8x8 = 7,
    dib_pattern_8x8 = 8,
    mono_pattern = 9,
};

pub fn parse(raw: u32) !Style {
    return switch (raw) {
        0 => .solid,
        1 => .null,
        2 => .hatched,
        3 => .pattern,
        4 => .indexed,
        5 => .dib_pattern,
        6 => .dib_pattern_pt,
        7 => .pattern_8x8,
        8 => .dib_pattern_8x8,
        9 => .mono_pattern,
        else => error.UnsupportedEmfBrushStyle,
    };
}

test "brush style accepts exactly the defined domain" {
    const testing = @import("std").testing;
    for (0..10) |raw| try testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try parse(@intCast(raw))));
    try testing.expectError(error.UnsupportedEmfBrushStyle, parse(10));
    try testing.expectError(error.UnsupportedEmfBrushStyle, parse(0xffffffff));
}

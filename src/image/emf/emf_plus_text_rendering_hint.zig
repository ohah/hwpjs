pub const TextRenderingHint = enum(u8) {
    system_default = 0,
    single_bit_per_pixel_grid_fit = 1,
    single_bit_per_pixel = 2,
    antialias_grid_fit = 3,
    antialias = 4,
    clear_type_grid_fit = 5,

    pub fn parse(raw: u8) !TextRenderingHint {
        if (raw > @intFromEnum(TextRenderingHint.clear_type_grid_fit)) return error.InvalidEmfPlusTextRenderingHint;
        return @enumFromInt(raw);
    }
};

test "EMF+ TextRenderingHint accepts exactly the official domain" {
    const std = @import("std");
    for (0..6) |raw|
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(try TextRenderingHint.parse(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusTextRenderingHint, TextRenderingHint.parse(6));
    try std.testing.expectError(error.InvalidEmfPlusTextRenderingHint, TextRenderingHint.parse(0xff));
}

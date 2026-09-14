pub const Standard = enum(u32) {
    horizontal = 0,
    vertical = 1,
    forward_diagonal = 2,
    backward_diagonal = 3,
    cross = 4,
    diagonal_cross = 5,
};

pub const Cosmetic = enum(u32) { solid_text_color = 8, solid_background_color = 10 };

pub fn parseStandard(raw: u32) !Standard {
    return switch (raw) {
        0 => .horizontal,
        1 => .vertical,
        2 => .forward_diagonal,
        3 => .backward_diagonal,
        4 => .cross,
        5 => .diagonal_cross,
        else => error.UnsupportedEmfHatchStyle,
    };
}

pub fn parseCosmetic(raw: u32) !Cosmetic {
    return switch (raw) {
        8 => .solid_text_color,
        10 => .solid_background_color,
        else => error.UnsupportedEmfCosmeticHatchStyle,
    };
}

test "standard and cosmetic hatch domains stay distinct" {
    const testing = @import("std").testing;
    for (0..6) |raw| _ = try parseStandard(@intCast(raw));
    try testing.expectError(error.UnsupportedEmfHatchStyle, parseStandard(8));
    _ = try parseCosmetic(8);
    _ = try parseCosmetic(10);
    try testing.expectError(error.UnsupportedEmfCosmeticHatchStyle, parseCosmetic(5));
}

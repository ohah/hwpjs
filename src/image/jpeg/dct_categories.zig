pub const Limits = struct { dc: u8, ac: u8 };

/// T.81 Huffman DCT magnitude categories, before progressive point scaling.
pub fn forPrecision(precision: u8) !Limits {
    return switch (precision) {
        8 => .{ .dc = 11, .ac = 10 },
        12 => .{ .dc = 15, .ac = 14 },
        else => error.InvalidJpegPrecision,
    };
}

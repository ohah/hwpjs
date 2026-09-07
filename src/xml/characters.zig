/// XML 1.0 Fifth Edition production [2]. Discouraged is not forbidden.
pub fn valid(c: u32) bool {
    return switch (c) {
        0x9, 0xa, 0xd, 0x20...0xd7ff, 0xe000...0xfffd, 0x10000...0x10ffff => true,
        else => false,
    };
}
/// XML 1.0 Fifth Edition [4], NOT a namespace QName or Unicode category test.
pub fn nameStart(c: u32) bool {
    return switch (c) {
        ':', 'A'...'Z', '_', 'a'...'z', 0xc0...0xd6, 0xd8...0xf6, 0xf8...0x2ff, 0x370...0x37d, 0x37f...0x1fff, 0x200c...0x200d, 0x2070...0x218f, 0x2c00...0x2fef, 0x3001...0xd7ff, 0xf900...0xfdcf, 0xfdf0...0xfffd, 0x10000...0xeffff => true,
        else => false,
    };
}
pub fn nameContinue(c: u32) bool {
    return nameStart(c) or switch (c) {
        '-', '.', '0'...'9', 0xb7, 0x300...0x36f, 0x203f...0x2040 => true,
        else => false,
    };
}

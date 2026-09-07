/// XML 1.0 Fifth Edition production [2]. Discouraged is not forbidden.
pub fn valid(c: u32) bool {
    return switch (c) {
        0x9, 0xa, 0xd, 0x20...0xd7ff, 0xe000...0xfffd, 0x10000...0x10ffff => true,
        else => false,
    };
}

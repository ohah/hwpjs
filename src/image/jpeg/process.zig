pub const Mode = enum { baseline, sequential, progressive, lossless };
pub const Coding = enum { huffman, arithmetic };
pub const Process = struct { mode: Mode, coding: Coding };
/// Non-hierarchical T.81 processes. Differential frames need B.3 context.
pub fn fromMarker(code: u8) !Process {
    return switch (code) {
        0xc0 => .{ .mode = .baseline, .coding = .huffman },
        0xc1 => .{ .mode = .sequential, .coding = .huffman },
        0xc2 => .{ .mode = .progressive, .coding = .huffman },
        0xc3 => .{ .mode = .lossless, .coding = .huffman },
        0xc9 => .{ .mode = .sequential, .coding = .arithmetic },
        0xca => .{ .mode = .progressive, .coding = .arithmetic },
        0xcb => .{ .mode = .lossless, .coding = .arithmetic },
        0xc5...0xc7, 0xcd...0xcf => error.UnsupportedJpegHierarchicalFrame,
        else => error.InvalidJpegFrameMarker,
    };
}
pub fn validPrecision(mode: Mode, precision: u8) bool {
    return switch (mode) {
        .baseline => precision == 8,
        .sequential, .progressive => precision == 8 or precision == 12,
        .lossless => precision >= 2 and precision <= 16,
    };
}

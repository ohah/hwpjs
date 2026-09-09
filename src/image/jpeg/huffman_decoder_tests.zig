const std = @import("std");
const t = std.testing;
const h = @import("huffman.zig");
const Decoder = @import("huffman_decoder.zig").Decoder;
const Bits = @import("entropy_bits.zig").Bits;

test "JPEG canonical Huffman sparse lengths decode every depth and symbol byte" {
    for (0..16) |depth| for (0..256) |symbol| {
        var raw = [_]u8{0} ** 18;
        raw[depth + 1] = 1;
        raw[17] = @intCast(symbol);
        var it = try h.Iterator.init(&raw, .{});
        const decoder = try Decoder.init((try it.next()).?);
        var bits = try Bits.init(&.{ 0, 0 }, 2);
        try t.expectEqual(@as(u8, @intCast(symbol)), try decoder.decode(&bits));
        try t.expectEqual((depth + 8) / 8, bits.reader.offset);
        try t.expectEqual(@as(u4, @intCast((7 - depth % 8))), bits.remaining);
        try t.expect(decoder.symbols.ptr == raw[17..].ptr);
    };
}

test "JPEG canonical Huffman mixed code lengths retain input symbol order" {
    // 00->9, 01->4, 100->7, 101->2 (unused all-ones prefixes remain).
    const raw = [_]u8{ 0, 0, 2, 2 } ++ [_]u8{0} ** 13 ++ .{ 9, 4, 7, 2 };
    var it = try h.Iterator.init(&raw, .{});
    const decoder = try Decoder.init((try it.next()).?);
    var bits = try Bits.init(&.{ 0b00011001, 0b01111111 }, 2);
    for ([_]u8{ 9, 4, 7, 2 }) |value| try t.expectEqual(value, try decoder.decode(&bits));
    try bits.finish();
    // A second symbol value may be identical without changing prefix parsing.
    var duplicate = raw;
    duplicate[18] = 9;
    var dup_it = try h.Iterator.init(&duplicate, .{});
    const dup = try Decoder.init((try dup_it.next()).?);
    var dup_bits = try Bits.init(&.{0b00011111}, 1);
    try t.expectEqual(@as(u8, 9), try dup.decode(&dup_bits));
    try t.expectEqual(@as(u8, 9), try dup.decode(&dup_bits));
    try dup_bits.finish();
}

test "JPEG Huffman invalid prefix and truncated code preserve unaligned cursor" {
    var raw = [_]u8{0} ** 18;
    raw[16] = 1; // The only code has 16 zero bits.
    var it = try h.Iterator.init(&raw, .{});
    const decoder = try Decoder.init((try it.next()).?);
    var short = try Bits.init(&.{0}, 1);
    _ = try short.read(1);
    const before = short;
    try t.expectError(error.UnexpectedEnd, decoder.decode(&short));
    try t.expectEqualDeep(before, short);
    var bad = try Bits.init(&.{ 255, 0, 255, 0, 255, 0 }, 6);
    _ = try bad.read(1);
    const bad_before = bad;
    try t.expectError(error.InvalidJpegHuffmanCode, decoder.decode(&bad));
    try t.expectEqualDeep(bad_before, bad);
}

test "JPEG Huffman decoder rejects empty mismatched and invalid length definitions" {
    var empty_it = try h.Iterator.init(&([_]u8{0} ** 17), .{});
    const empty = (try empty_it.next()).?;
    try t.expectError(error.EmptyJpegHuffmanTable, Decoder.init(empty));
    var mismatch = empty;
    mismatch.symbols = &.{3};
    try t.expectError(error.InvalidJpegHuffmanSymbolCount, Decoder.init(mismatch));
    var invalid_bits = [_]u8{0} ** 16;
    invalid_bits[0] = 2;
    mismatch.bits = &invalid_bits;
    try t.expectError(error.InvalidJpegHuffmanCodeSpace, Decoder.init(mismatch));
}

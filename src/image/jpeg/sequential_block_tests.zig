const std = @import("std");
const t = std.testing;
const Block = @import("sequential_block.zig").Decoder;
const Bits = @import("entropy_bits.zig").Bits;
const h = @import("huffman.zig");
const frame_parser = @import("frame.zig");
const frame_bytes = [_]u8{ 8, 0, 1, 0, 1, 1, 9, 17, 0 };
// DC: 00->0, 01->1, 10->2. AC: 000->EOB,001->01,010->F0,011->E1.
const dc = [_]u8{ 0, 0, 3 } ++ [_]u8{0} ** 14 ++ .{ 0, 1, 2 };
const ac = [_]u8{ 16, 0, 0, 4 } ++ [_]u8{0} ** 13 ++ .{ 0, 1, 240, 225 };
fn decoder(dc_raw: []const u8, ac_raw: []const u8) !Block {
    var di = try h.Iterator.init(dc_raw, .{});
    var ai = try h.Iterator.init(ac_raw, .{});
    return Block.init(try frame_parser.parse(0xc0, &frame_bytes, .{}), (try di.next()).?, (try ai.next()).?);
}

test "JPEG sequential block EOB DC difference and last zigzag coefficient" {
    const d = try decoder(&dc, &ac);
    var zero = try Bits.init(&.{0b00000111}, 1);
    const empty = try d.decode(&zero, 17);
    try t.expectEqual(@as(i32, 17), empty[0]);
    for (empty[1..]) |value| try t.expectEqual(@as(i32, 0), value);
    try zero.finish();
    // 01|1, 010,010,010,011|0: +1 DC, 48 zero ACs then -1 at index63.
    var last = try Bits.init(&.{ 0b01101001, 0b00100110 }, 2);
    const block = try d.decode(&last, 10);
    try t.expectEqual(@as(i32, 11), block[0]);
    try t.expectEqual(@as(i32, -1), block[63]);
    for (block[1..63]) |value| try t.expectEqual(@as(i32, 0), value);
    try last.finish();
    // 10|00,001|1,000: -3 DC, +1 AC, EOB.
    var negative = try Bits.init(&.{ 0b10000011, 0b00011111 }, 2);
    const signed = try d.decode(&negative, 10);
    try t.expectEqual(@as(i32, 7), signed[0]);
    try t.expectEqual(@as(i32, 1), signed[1]);
    try negative.finish();
}

test "JPEG sequential ZRL may end exactly at 64 but not cross the block" {
    const d = try decoder(&dc, &ac);
    // 00,010,010,011|1,010: coefficient47=1 then exactly 16 final zeros.
    var exact = try Bits.init(&.{ 0b00010010, 0b01110101 }, 2);
    const block = try d.decode(&exact, 0);
    try t.expectEqual(@as(i32, 1), block[47]);
    for (block[48..]) |value| try t.expectEqual(@as(i32, 0), value);
    try exact.finish();
    // 00 followed by four 010 ZRL codes: index1 +64 exceeds the block.
    var overflow = try Bits.init(&.{ 0b00010010, 0b01001011 }, 2);
    const before = overflow;
    try t.expectError(error.InvalidJpegAcRun, d.decode(&overflow, 0));
    try t.expectEqualDeep(before, overflow);
    const ac_f1 = [_]u8{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{241};
    const run_decoder = try decoder(&dc, &ac_f1);
    var run = try Bits.init(&.{ 0b00010101, 0b01111111 }, 2);
    const run_before = run;
    try t.expectError(error.InvalidJpegAcRun, run_decoder.decode(&run, 0));
    try t.expectEqualDeep(run_before, run);
}

test "JPEG sequential block truncation and predictor overflow preserve bit state" {
    const d = try decoder(&dc, &ac);
    const raw = [_]u8{ 0b01101001, 0b00100110 };
    for (0..raw.len) |n| {
        var bits = try Bits.init(raw[0..n], raw.len);
        const before = bits;
        try t.expectError(error.UnexpectedEnd, d.decode(&bits, 10));
        try t.expectEqualDeep(before, bits);
    }
    var positive = try Bits.init(&raw, raw.len);
    const before = positive;
    try t.expectError(error.InvalidJpegDcPredictor, d.decode(&positive, std.math.maxInt(i32)));
    try t.expectEqualDeep(before, positive);
    var negative = try Bits.init(&.{ 0b10000011, 0b00011111 }, 2);
    const negative_before = negative;
    try t.expectError(error.InvalidJpegDcPredictor, d.decode(&negative, std.math.minInt(i32)));
    try t.expectEqualDeep(negative_before, negative);
}

test "JPEG sequential block rejects invalid categories and table classes" {
    const dc_bad = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{12};
    const ac_bad = [_]u8{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{16};
    var bits = try Bits.init(&.{0}, 1);
    const before = bits;
    const invalid_dc = try decoder(&dc_bad, &ac);
    try t.expectError(error.InvalidJpegDcCategory, invalid_dc.decode(&bits, 0));
    const invalid_ac = try decoder(&dc, &ac_bad);
    try t.expectError(error.InvalidJpegAcSymbol, invalid_ac.decode(&bits, 0));
    try t.expectEqualDeep(before, bits);
    try t.expectError(error.InvalidJpegHuffmanClass, decoder(&ac, &dc));
}

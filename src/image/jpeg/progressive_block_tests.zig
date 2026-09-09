const std = @import("std");
const t = std.testing;
const progressive = @import("progressive_block.zig");
const Decoder = progressive.Decoder;
const State = progressive.State;
const Bits = @import("entropy_bits.zig").Bits;
const huffman = @import("huffman.zig");
const frame = @import("frame.zig");
const frame_bytes = [_]u8{ 8, 0, 1, 0, 1, 1, 9, 17, 0 };
const dc = [_]u8{ 0, 0, 3 } ++ [_]u8{0} ** 14 ++ .{ 0, 1, 2 };
// 000 EOB, 001 new coefficient, 010 EOB1, 011 ZRL.
const ac = [_]u8{ 16, 0, 0, 4 } ++ [_]u8{0} ** 13 ++ .{ 0, 1, 16, 240 };

fn decoder(start: u8, end: u8, ah: u8, al: u8, raw: ?[]const u8) !Decoder {
    var table: ?huffman.Table = null;
    if (raw) |bytes| {
        var it = try huffman.Iterator.init(bytes, .{});
        table = (try it.next()).?;
    }
    return Decoder.init(try frame.parse(0xc2, &frame_bytes, .{}), &.{ 1, 9, 0, start, end, ah * 16 + al }, table);
}

test "JPEG progressive block DC predictor scaling differs from AC negative refinement" {
    var bits = try Bits.init(&.{0x8f}, 1); // 10(category2) 00(-3), pad1111
    var state: State = .{ .predictor = 5 };
    var block: [64]i32 = @splat(0);
    block[1] = 77;
    try (try decoder(0, 0, 0, 3, &dc)).decode(&bits, &state, &block);
    try t.expectEqual(@as(i32, 2), state.predictor);
    try t.expectEqual(@as(i32, 16), block[0]);
    try t.expectEqual(@as(i32, 77), block[1]);
    try bits.finish();
    block[0] = -8;
    bits = try Bits.init(&.{ 255, 0 }, 2);
    try (try decoder(0, 0, 3, 2, null)).decode(&bits, &state, &block);
    try t.expectEqual(@as(i32, -4), block[0]);
    try bits.finish();
    block[1] = -8;
    bits = try Bits.init(&.{0x1f}, 1); // EOB000 + correction1
    try (try decoder(1, 1, 3, 2, &ac)).decode(&bits, &state, &block);
    try t.expectEqual(@as(i32, -12), block[1]);
    try t.expectEqual(@as(i32, 2), state.predictor);
    try bits.finish();
}

test "JPEG progressive block initial AC ZRL may end exactly at spectral boundary" {
    var bits = try Bits.init(&.{0x27}, 1); // 001 0(-1) 011(ZRL), pad1
    var state: State = .{};
    var block: [64]i32 = @splat(0);
    block[0] = 99;
    try (try decoder(1, 17, 0, 1, &ac)).decode(&bits, &state, &block);
    try t.expectEqual(@as(i32, -2), block[1]);
    try t.expectEqual(@as(i32, 99), block[0]);
    try bits.finish();
    bits = try Bits.init(&.{0x27}, 1);
    block[1] = 0;
    const before = bits;
    const old = block;
    try t.expectError(error.InvalidJpegAcRun, (try decoder(1, 16, 0, 1, &ac)).decode(&bits, &state, &block));
    try t.expectEqualDeep(before, bits);
    try t.expectEqualDeep(old, block);
    try t.expectEqualDeep(State{}, state);
}

test "JPEG progressive block maximum EOB run spans blocks but not restart boundary" {
    const table = [_]u8{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{224};
    const d = try decoder(1, 63, 0, 0, &table);
    var bits = try Bits.init(&.{ 0x7f, 0xff, 0 }, 3); // 0 + fourteen ones + pad1
    var block: [64]i32 = @splat(0);
    var state: State = .{};
    try d.decode(&bits, &state, &block);
    try t.expectEqual(@as(u16, 32766), state.eob_remaining);
    try t.expectError(error.UnfinishedJpegEobRun, state.finish());
    const after_code = bits;
    for (0..32766) |_| try d.decode(&bits, &state, &block);
    try t.expectEqualDeep(after_code, bits);
    try state.finish();
    try bits.finish();
}

test "JPEG progressive block AC sign precedes correction and ZRL stops at sixteenth zero" {
    var block: [64]i32 = @splat(0);
    block[1] = -4;
    block[3] = 4;
    var state: State = .{};
    var bits = try Bits.init(&.{ 0x28, 0xff, 0 }, 3); // 001 sign0 corr1,000 EOB,corr1,pad
    try (try decoder(1, 4, 1, 0, &ac)).decode(&bits, &state, &block);
    try t.expectEqualSlices(i32, &.{ -5, -1, 5, 0 }, block[1..5]);
    try bits.finish();
    block = @splat(0);
    block[1] = 4;
    block[18] = -4;
    bits = try Bits.init(&.{0x71}, 1); // 011 ZRL,corr1,000 EOB,corr1
    try (try decoder(1, 18, 1, 0, &ac)).decode(&bits, &state, &block);
    try t.expectEqual(@as(i32, 5), block[1]);
    try t.expectEqual(@as(i32, -5), block[18]);
    for (block[2..18]) |value| try t.expectEqual(@as(i32, 0), value);
    try bits.finish();
}

test "JPEG progressive block refinement EOB carries correction bits into next block" {
    const d = try decoder(1, 1, 1, 0, &ac);
    var bits = try Bits.init(&.{0x57}, 1); // 010 EOB1 + extension1(run3) + corr0,1,1
    var state: State = .{};
    for ([_]i32{ 4, -4, 8 }, [_]i32{ 4, -5, 9 }, 0..) |prior, expected, i| {
        var block: [64]i32 = @splat(0);
        block[1] = prior;
        try d.decode(&bits, &state, &block);
        try t.expectEqual(expected, block[1]);
        try t.expectEqual(2 - i, state.eob_remaining);
    }
    try state.finish();
    try bits.finish();
}

test "JPEG progressive block late errors preserve bits predictor EOB and all coefficients" {
    const d = try decoder(1, 4, 1, 0, &ac);
    var bits = try Bits.init(&.{0x2f}, 1); // valid insertion/correction then incomplete code
    var block: [64]i32 = @splat(0);
    block[1] = -4;
    var state: State = .{ .predictor = 7 };
    const old_bits = bits;
    const old_block = block;
    const old_state = state;
    try t.expectError(error.UnexpectedEnd, d.decode(&bits, &state, &block));
    try t.expectEqualDeep(old_bits, bits);
    try t.expectEqualDeep(old_block, block);
    try t.expectEqualDeep(old_state, state);
    block[1] = 3;
    try t.expectError(error.InvalidJpegProgressiveCoefficient, d.decode(&bits, &state, &block));
    state.eob_remaining = 32768;
    try t.expectError(error.InvalidJpegEobRun, d.decode(&bits, &state, &block));
    const invalid = [_]u8{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{2};
    block = @splat(0);
    state = .{};
    bits = try Bits.init(&.{0}, 1);
    try t.expectError(error.InvalidJpegAcRefinementSymbol, (try decoder(1, 4, 1, 0, &invalid)).decode(&bits, &state, &block));
    try t.expectError(error.InvalidJpegApproximation, decoder(1, 4, 3, 1, &ac));
    try t.expectError(error.InvalidJpegHuffmanClass, decoder(0, 0, 0, 0, &ac));
    try t.expectError(error.MissingJpegHuffmanTable, decoder(1, 1, 0, 0, null));
}

test "JPEG progressive block all refinement bit positions preserve DC and AC sign rules" {
    for (0..13) |al| {
        const step: i32 = @as(i32, 1) << @as(u5, @intCast(al));
        const d = try decoder(0, 0, @intCast(al + 1), @intCast(al), null);
        const a = try decoder(1, 1, @intCast(al + 1), @intCast(al), &ac);
        for ([_]i32{ -32768, -129, -2, -1, 1, 2, 129, 32767 }) |n| for (0..2) |bit| {
            const prior = n * 2 * step;
            var block: [64]i32 = @splat(0);
            block[0] = prior;
            var state: State = .{};
            var bits = try Bits.init(if (bit == 1) &.{ 255, 0 } else &.{127}, 2);
            try d.decode(&bits, &state, &block);
            try t.expectEqual(prior + @as(i32, @intCast(bit)) * step, block[0]);
            try bits.finish();
            block[1] = prior;
            bits = try Bits.init(if (bit == 1) &.{31} else &.{15}, 1);
            try a.decode(&bits, &state, &block);
            try t.expectEqual(prior + @as(i32, @intCast(bit)) * (if (n < 0) -step else step), block[1]);
            try bits.finish();
        };
    }
}

test "JPEG progressive block overflow and invalid initial history are transactional" {
    var block: [64]i32 = @splat(0);
    var state: State = .{ .predictor = std.math.maxInt(i32) };
    var bits = try Bits.init(&.{127}, 1); // DC category1 + positive1
    const before = bits;
    try t.expectError(error.InvalidJpegDcPredictor, (try decoder(0, 0, 0, 0, &dc)).decode(&bits, &state, &block));
    try t.expectEqualDeep(before, bits);
    try t.expectEqual(std.math.maxInt(i32), state.predictor);
    try t.expectEqual(@as(i32, 0), block[0]);
    bits = try Bits.init(&.{63}, 1); // category0, point scaling still overflows
    try t.expectError(error.InvalidJpegProgressiveCoefficient, (try decoder(0, 0, 0, 1, &dc)).decode(&bits, &state, &block));
    try t.expectEqual(@as(usize, 0), bits.reader.offset);
    block[1] = std.math.minInt(i32);
    state = .{};
    bits = try Bits.init(&.{31}, 1);
    try t.expectError(error.InvalidJpegProgressiveCoefficient, (try decoder(1, 1, 1, 0, &ac)).decode(&bits, &state, &block));
    try t.expectEqual(std.math.minInt(i32), block[1]);
    try t.expectEqualDeep(State{}, state);
    try t.expectEqual(@as(usize, 0), bits.reader.offset);
    try t.expectError(error.InvalidJpegInitialCoefficient, (try decoder(1, 1, 0, 0, &ac)).decode(&bits, &state, &block));
}

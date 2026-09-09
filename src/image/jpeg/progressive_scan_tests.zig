const std = @import("std");
const t = std.testing;
const Frame = @import("frame.zig");
const Decoder = @import("progressive_scan.zig").Decoder;
const Store = @import("table_store.zig").Store;
const zero: [64]i32 = @splat(0);
const mono = [_]u8{ 8, 0, 8, 0, 16, 1, 9, 17, 0 };
const dc_scan = [_]u8{ 1, 9, 0, 0, 0, 2 };
const ac_scan = [_]u8{ 1, 9, 0, 1, 63, 0 };
const qt = [_]u8{0} ++ [_]u8{1} ** 64;
const dc = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{1};
const ac = [_]u8{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{16};

fn tables() !Store {
    var s: Store = .{};
    try s.installQuantization(&qt, .{});
    try s.installHuffman(&dc, .{});
    try s.installHuffman(&ac, .{});
    return s;
}

fn unchanged(before: Decoder, after: Decoder) !void {
    try t.expectEqual(before.emitted, after.emitted);
    try t.expectEqual(before.complete, after.complete);
    try t.expectEqualDeep(before.reader, after.reader);
    try t.expectEqualDeep(before.bits, after.bits);
    try t.expectEqualDeep(before.restarts, after.restarts);
    try t.expectEqualDeep(before.states, after.states);
}

test "JPEG progressive scan DC predictors use transformed units and preserve other bands" {
    const store = try tables();
    var d = try Decoder.init(try Frame.parse(194, &mono, .{}), &dc_scan, &store, 8, 0, &.{ 0x5f, 255, 217 }, .{});
    var prior = zero;
    prior[63] = 73;
    for (0..2) |i| {
        try t.expectEqual(@as(u32, @intCast(i)), d.position().?.x);
        const b = (try d.next(prior)).?;
        try t.expectEqual(@as(i32, @intCast((i + 1) * 4)), b.values[0]);
        try t.expectEqual(@as(i32, 73), b.values[63]);
        try t.expectEqual(@as(u8, 9), b.component_id);
        try t.expectEqual(@as(usize, 0), b.frame_component);
        try t.expectEqual(@as(u32, @intCast(i)), b.x);
        try t.expectEqual(@as(u32, 0), b.y);
    }
    try t.expect(d.position() == null);
    try t.expect(!d.complete);
    try t.expect(try d.next(zero) == null);
    try t.expect(d.complete);
    try t.expectEqual(@as(usize, 1), d.reader.offset);
    try t.expectEqual(@as(i32, 0), prior[0]);
    try t.expect(try d.next(prior) == null);
}

test "JPEG progressive scan DC refinement needs no Huffman table" {
    var store = try tables();
    store.huffman = @splat(@splat(null));
    var d = try Decoder.init(try Frame.parse(194, &mono, .{}), &.{ 1, 9, 0, 0, 0, 0x32 }, &store, 8, 0, &.{ 255, 0, 255, 217 }, .{});
    for ([_]i32{ -8, 8 }) |n| {
        var prior = zero;
        prior[0] = n;
        try t.expectEqual(n + 4, (try d.next(prior)).?.values[0]);
    }
    try t.expect(try d.next(zero) == null);
    try t.expectEqual(@as(usize, 2), d.reader.offset);
}

test "JPEG progressive scan EOB runs span blocks but not scan end or restart" {
    const store = try tables();
    const frame = try Frame.parse(194, &mono, .{});
    var d = try Decoder.init(frame, &ac_scan, &store, 8, 0, &.{ 0x3f, 255, 217 }, .{});
    _ = try d.next(zero);
    try t.expectEqual(@as(u16, 1), d.states[0].eob_remaining);
    const bits = d.bits;
    _ = try d.next(zero);
    try t.expectEqualDeep(bits, d.bits);
    try t.expect(try d.next(zero) == null);
    var end = try Decoder.init(frame, &ac_scan, &store, 8, 0, &.{ 0x7f, 255, 217 }, .{});
    _ = try end.next(zero);
    _ = try end.next(zero);
    const before_end = end;
    try t.expectError(error.UnfinishedJpegEobRun, end.next(zero));
    try unchanged(before_end, end);
    var restart = try Decoder.init(frame, &ac_scan, &store, 8, 1, &.{ 0x3f, 255, 208, 0x3f, 255, 217 }, .{});
    _ = try restart.next(zero);
    const before_restart = restart;
    try t.expectError(error.UnfinishedJpegEobRun, restart.next(zero));
    try unchanged(before_restart, restart);
}

test "JPEG progressive scan pending EOB consumes later AC correction bits" {
    const store = try tables();
    var d = try Decoder.init(try Frame.parse(194, &mono, .{}), &.{ 1, 9, 0, 1, 1, 16 }, &store, 8, 0, &.{ 0x2f, 255, 217 }, .{});
    for ([_]i32{ -4, 4 }, [_]i32{ -5, 4 }) |n, expected| {
        var prior = zero;
        prior[1] = n;
        try t.expectEqual(expected, (try d.next(prior)).?.values[1]);
        try t.expectEqual(n, prior[1]);
    }
    try t.expect(try d.next(zero) == null);
}

test "JPEG progressive scan restart resets DC and is transactional through next block" {
    const store = try tables();
    const frame = try Frame.parse(194, &mono, .{});
    const raw = [_]u8{ 0x7f, 255, 208, 0x7f, 255, 217 };
    var d = try Decoder.init(frame, &dc_scan, &store, 8, 1, &raw, .{});
    try t.expectEqual(@as(i32, 4), (try d.next(zero)).?.values[0]);
    try t.expectEqual(@as(i32, 4), (try d.next(zero)).?.values[0]);
    try t.expect(try d.next(zero) == null);
    try t.expectEqual(@as(usize, 1), d.restarts.count);
    for ([_]u8{ 209, 217 }) |code| {
        var bad_raw = raw;
        bad_raw[2] = code;
        var bad = try Decoder.init(frame, &dc_scan, &store, 8, 1, &bad_raw, .{});
        _ = try bad.next(zero);
        const before = bad;
        try t.expectError(error.InvalidJpegRestartSequence, bad.next(zero));
        try unchanged(before, bad);
    }
    var short = try Decoder.init(frame, &dc_scan, &store, 8, 1, &.{ 0x7f, 255, 208, 255, 217 }, .{});
    _ = try short.next(zero);
    const before = short;
    try t.expectError(error.UnexpectedEnd, short.next(zero));
    try unchanged(before, short);
    var prior = zero;
    prior[0] = 1;
    var initial = try Decoder.init(frame, &dc_scan, &store, 8, 1, &raw, .{});
    _ = try initial.next(zero);
    const before_initial = initial;
    try t.expectError(error.InvalidJpegInitialCoefficient, initial.next(prior));
    try unchanged(before_initial, initial);
    try t.expectEqual(@as(i32, 4), (try initial.next(zero)).?.values[0]);
}

test "JPEG progressive interleaved scan counts restart in MCU not blocks" {
    const store = try tables();
    const frame = try Frame.parse(194, &.{ 8, 0, 8, 0, 17, 2, 9, 33, 0, 4, 17, 0 }, .{});
    const scan = [_]u8{ 2, 9, 0, 4, 0, 0, 0, 0 };
    const plain = [_]u8{ 0x51, 0x4f, 255, 217 };
    const restarted = [_]u8{ 0x53, 255, 208, 0x53, 255, 217 };
    for ([_]u16{ 0, 1 }) |interval| {
        var d = try Decoder.init(frame, &scan, &store, 8, interval, if (interval == 0) &plain else &restarted, .{});
        const expected = if (interval == 0) [_]i32{ 1, 2, -1, 3, 4, -2 } else [_]i32{ 1, 2, -1, 1, 2, -1 };
        for (expected, 0..) |v, i| {
            const b = (try d.next(zero)).?;
            try t.expectEqual(v, b.values[0]);
            try t.expectEqual(@as(u8, if (i % 3 == 2) 4 else 9), b.component_id);
            try t.expectEqual(@as(usize, if (i % 3 == 2) 1 else 0), b.frame_component);
            try t.expectEqual(([_]u32{ 0, 1, 0, 2, 3, 1 })[i], b.x);
            try t.expectEqual(@as(u32, 0), b.y);
        }
        try t.expect(try d.next(zero) == null);
        try t.expectEqual(@as(usize, interval), d.restarts.count);
    }
}

test "JPEG progressive scan limits process selection and resolved height" {
    const store = try tables();
    const frame = try Frame.parse(194, &mono, .{});
    const raw = [_]u8{ 0x7f, 255, 208, 0x7f, 255, 217 };
    try t.expectError(error.LimitExceeded, Decoder.init(frame, &dc_scan, &store, 8, 1, &raw, .{ .max_bytes = 5 }));
    try t.expectError(error.LimitExceeded, Decoder.init(frame, &dc_scan, &store, 8, 1, &raw, .{ .max_blocks = 1 }));
    var d = try Decoder.init(frame, &dc_scan, &store, 8, 1, &raw, .{ .max_restarts = 0 });
    _ = try d.next(zero);
    const before = d;
    try t.expectError(error.LimitExceeded, d.next(zero));
    try unchanged(before, d);
    try t.expectError(error.UnsupportedJpegProgressiveScan, Decoder.init(try Frame.parse(192, &mono, .{}), &dc_scan, &store, 8, 0, &raw, .{}));
    var missing = store;
    missing.huffman[0][0] = null;
    try t.expectError(error.MissingJpegHuffmanTable, Decoder.init(frame, &dc_scan, &missing, 8, 0, &raw, .{}));
    missing = store;
    missing.quantization[0] = null;
    try t.expectError(error.MissingJpegQuantizationTable, Decoder.init(frame, &dc_scan, &missing, 8, 0, &raw, .{}));
    var no_height = mono;
    no_height[2] = 0;
    const unresolved = try Frame.parse(194, &no_height, .{});
    try t.expectError(error.MissingJpegDnl, Decoder.init(unresolved, &dc_scan, &store, 0, 0, &.{ 0x5f, 255, 217 }, .{}));
    var resolved = try Decoder.init(unresolved, &dc_scan, &store, 8, 0, &.{ 0x5f, 255, 217 }, .{});
    _ = try resolved.next(zero);
    _ = try resolved.next(zero);
    try t.expect(try resolved.next(zero) == null);
}

test "JPEG progressive scan validates terminal padding bytes and extra restart atomically" {
    const store = try tables();
    const frame = try Frame.parse(194, &mono, .{});
    const cases = [_]struct { bytes: []const u8, err: anyerror }{
        .{ .bytes = &.{ 0x50, 255, 217 }, .err = error.InvalidJpegEntropyPadding },
        .{ .bytes = &.{ 0x5f, 255, 0, 255, 217 }, .err = error.TrailingJpegEntropyBytes },
        .{ .bytes = &.{ 0x5f, 255, 208 }, .err = error.InvalidJpegRestartPosition },
    };
    for (cases) |c| {
        var d = try Decoder.init(frame, &dc_scan, &store, 8, 0, c.bytes, .{});
        _ = try d.next(zero);
        _ = try d.next(zero);
        const before = d;
        try t.expectError(c.err, d.next(zero));
        try unchanged(before, d);
    }
}

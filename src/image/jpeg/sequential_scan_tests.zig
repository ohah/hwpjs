const std = @import("std");
const t = std.testing;
const frame_parser = @import("frame.zig");
const scan_parser = @import("scan.zig");
const Layout = @import("mcu_layout.zig").Layout;
const Decoder = @import("sequential_scan.zig").Decoder;
const Store = @import("table_store.zig").Store;

const mono = [_]u8{ 8, 0, 8, 0, 16, 1, 9, 17, 0 };
const sos = [_]u8{ 1, 9, 0, 0, 63, 0 };
fn tables() !Store {
    var store: Store = .{};
    const q = struct {
        const bytes = [_]u8{0} ++ [_]u8{1} ** 64;
    };
    const dc = struct {
        const bytes = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{1};
    };
    const ac = struct {
        const bytes = [_]u8{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
    };
    try store.installQuantization(&q.bytes, .{});
    try store.installHuffman(&dc.bytes, .{});
    try store.installHuffman(&ac.bytes, .{});
    return store;
}

test "JPEG MCU layout distinguishes single scans from interleaved padded grids" {
    const raw = [_]u8{ 8, 0, 17, 0, 17, 3, 9, 34, 0, 4, 17, 0, 7, 17, 0 };
    const frame = try frame_parser.parse(0xc0, &raw, .{});
    const scan = try scan_parser.parse(&.{ 3, 9, 0, 4, 0, 7, 0, 0, 63, 0 }, frame);
    const layout = try Layout.init(frame, scan, 17, 24);
    try t.expectEqual(@as(u64, 4), layout.mcus);
    try t.expectEqual(@as(u64, 24), layout.blocks);
    const component_order = [_]usize{ 0, 0, 0, 0, 1, 2 };
    for (0..24) |n| {
        const p = layout.position(n).?;
        const slot = n % 6;
        const mcu = n / 6;
        try t.expectEqual(component_order[slot], p.component);
        try t.expectEqual(component_order[slot], p.frame_component);
        const x = if (slot < 4) mcu % 2 * 2 + slot % 2 else mcu % 2;
        const y = if (slot < 4) mcu / 2 * 2 + slot / 2 else mcu / 2;
        try t.expectEqual(@as(u32, @intCast(x)), p.x);
        try t.expectEqual(@as(u32, @intCast(y)), p.y);
    }
    try t.expect(layout.position(24) == null);
    try t.expectError(error.LimitExceeded, Layout.init(frame, scan, 17, 23));
    const one = try scan_parser.parse(&.{ 1, 9, 0, 0, 63, 0 }, frame);
    const single = try Layout.init(frame, one, 17, 9);
    try t.expectEqual(@as(u64, 9), single.blocks);
    try t.expectEqual(@as(usize, 1), single.count);
    const subset = try scan_parser.parse(&.{ 1, 7, 0, 0, 63, 0 }, frame);
    const reduced = try Layout.init(frame, subset, 17, 4);
    try t.expectEqual(@as(u64, 4), reduced.blocks);
    try t.expectEqual(@as(usize, 2), reduced.position(0).?.frame_component);
    try t.expectError(error.MissingJpegDnl, Layout.init(frame, one, 0, 9));
}

test "JPEG sequential scan accumulates DC and validates exact final padding" {
    const store = try tables();
    const frame = try frame_parser.parse(0xc0, &mono, .{});
    // Each block: DC code0, magnitude1 (+1), AC EOB0. Two blocks and 11 pad.
    var decoder = try Decoder.init(frame, &sos, &store, 8, 0, &.{ 0x4b, 255, 217 }, .{});
    for (1..3) |dc| {
        const block = (try decoder.next()).?;
        try t.expectEqual(@as(i32, @intCast(dc)), block.values[0]);
        try t.expectEqual(@as(u32, @intCast(dc - 1)), block.x);
        try t.expectEqual(@as(u8, 9), block.component_id);
    }
    try t.expect(!decoder.complete);
    try t.expect(try decoder.next() == null);
    try t.expect(decoder.complete);
    try t.expectEqual(@as(usize, 1), decoder.reader.offset);
    try t.expect(try decoder.next() == null);
    var bad = try Decoder.init(frame, &sos, &store, 8, 0, &.{ 0x48, 255, 217 }, .{});
    _ = try bad.next();
    _ = try bad.next();
    const before = bad.bits;
    try t.expectError(error.InvalidJpegEntropyPadding, bad.next());
    try t.expectEqualDeep(before, bad.bits);
    try t.expect(!bad.complete);
}

test "JPEG sequential restart resets predictors and rolls back failed transitions" {
    const store = try tables();
    const frame = try frame_parser.parse(0xc0, &mono, .{});
    const raw = [_]u8{ 0x5f, 255, 208, 0x5f, 255, 217 };
    var decoder = try Decoder.init(frame, &sos, &store, 8, 1, &raw, .{});
    try t.expectEqual(@as(i32, 1), (try decoder.next()).?.values[0]);
    try t.expectEqual(@as(i32, 1), (try decoder.next()).?.values[0]);
    try t.expect(try decoder.next() == null);
    try t.expectEqual(@as(usize, 1), decoder.restarts.count);
    for ([_]u8{ 209, 217 }) |code| {
        var malformed = raw;
        malformed[2] = code;
        var bad = try Decoder.init(frame, &sos, &store, 8, 1, &malformed, .{});
        _ = try bad.next();
        const bits = bad.bits;
        const offset = bad.reader.offset;
        try t.expectError(error.InvalidJpegRestartSequence, bad.next());
        try t.expectEqualDeep(bits, bad.bits);
        try t.expectEqual(offset, bad.reader.offset);
        try t.expectEqual(@as(usize, 0), bad.restarts.count);
        try t.expectEqual(@as(i32, 1), bad.predictors[0]);
    }
    var truncated = try Decoder.init(frame, &sos, &store, 8, 1, &.{ 0x5f, 255, 208, 255, 217 }, .{});
    _ = try truncated.next();
    try t.expectError(error.UnexpectedEnd, truncated.next());
    try t.expectEqual(@as(usize, 0), truncated.restarts.count);
    try t.expectEqual(@as(usize, 1), truncated.reader.offset);
    var limited = try Decoder.init(frame, &sos, &store, 8, 1, &raw, .{ .max_restarts = 0 });
    _ = try limited.next();
    try t.expectError(error.LimitExceeded, limited.next());
    try t.expectError(error.LimitExceeded, Decoder.init(frame, &sos, &store, 8, 0, &raw, .{ .max_blocks = 1 }));
}

test "JPEG sequential interleaved components keep independent predictors across MCU slots" {
    const store = try tables();
    const raw_frame = [_]u8{ 8, 0, 8, 0, 17, 2, 9, 33, 0, 4, 17, 0 };
    const frame = try frame_parser.parse(0xc0, &raw_frame, .{});
    const scan = [_]u8{ 2, 9, 0, 4, 0, 0, 63, 0 };
    const plain = [_]u8{ 0x48, 0x24, 0x3f, 255, 217 };
    const restarted = [_]u8{ 0x48, 0x7f, 255, 208, 0x48, 0x7f, 255, 217 };
    for ([_]u16{ 0, 1 }) |interval| {
        var decoder = try Decoder.init(frame, &scan, &store, 8, interval, if (interval == 0) &plain else &restarted, .{});
        const values = if (interval == 0) [_]i32{ 1, 2, -1, 3, 4, -2 } else [_]i32{ 1, 2, -1, 1, 2, -1 };
        for (values, 0..) |value, i| {
            const block = (try decoder.next()).?;
            try t.expectEqual(value, block.values[0]);
            try t.expectEqual(@as(u8, if (i % 3 == 2) 4 else 9), block.component_id);
        }
        try t.expect(try decoder.next() == null);
    }
}

test "JPEG sequential scan rejects extra restart and unread entropy after the last block" {
    const store = try tables();
    const frame = try frame_parser.parse(0xc0, &mono, .{});
    var extra_restart = try Decoder.init(frame, &sos, &store, 8, 2, &.{ 0x4b, 255, 208, 255, 217 }, .{});
    _ = try extra_restart.next();
    _ = try extra_restart.next();
    try t.expectError(error.InvalidJpegRestartPosition, extra_restart.next());
    try t.expect(!extra_restart.complete);
    var extra_byte = try Decoder.init(frame, &sos, &store, 8, 0, &.{ 0x4b, 255, 0, 255, 217 }, .{});
    _ = try extra_byte.next();
    _ = try extra_byte.next();
    try t.expectError(error.TrailingJpegEntropyBytes, extra_byte.next());
    var early = try Decoder.init(frame, &sos, &store, 8, 0, &.{ 0x5f, 255, 208, 0x5f, 255, 217 }, .{});
    _ = try early.next();
    try t.expectError(error.UnexpectedEnd, early.next());
    try t.expectEqual(@as(u64, 1), early.emitted);
}

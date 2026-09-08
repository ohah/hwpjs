const std = @import("std");
const t = std.testing;
const Store = @import("table_store.zig").Store;
const frame_parser = @import("frame.zig");
const scan_tables = @import("scan_tables.zig");
const quantization = .{0} ++ [_]u8{1} ** 64;
const dc = .{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const ac = .{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const frame_bytes = [_]u8{ 8, 0, 1, 0, 1, 1, 9, 0x11, 0 };
const sequential = [_]u8{ 1, 9, 0, 0, 63, 0 };

test "JPEG table store replaces exact destinations and preserves borrowed views" {
    var store: Store = .{};
    var qs: [260]u8 = undefined;
    var hs: [144]u8 = undefined;
    for (0..4) |id| {
        @memcpy(qs[id * 65 ..][0..65], &quantization);
        qs[id * 65] = @intCast(id);
        qs[id * 65 + 64] = @intCast(id + 1);
        for (0..2) |class| {
            const at = (class * 4 + id) * 18;
            @memcpy(hs[at..][0..18], &dc);
            hs[at] = @intCast(class * 16 + id);
            hs[at + 17] = @intCast(class * 4 + id);
        }
    }
    try store.installQuantization(&qs, .{});
    try store.installHuffman(&hs, .{});
    for (0..4) |id| {
        try t.expectEqual(id + 1, store.quantization[id].?.value(63).?);
        try t.expect(store.quantization[id].?.raw.ptr == qs[id * 65 + 1 ..].ptr);
        for (0..2) |class| try t.expectEqual(class * 4 + id, store.huffman[class][id].?.symbols[0]);
    }
    const replaced = quantization ++ (.{0} ++ [_]u8{7} ** 64);
    try store.installQuantization(&replaced, .{});
    try t.expectEqual(@as(u16, 7), store.quantization[0].?.value(63).?);
    try t.expectEqual(@as(u16, 4), store.quantization[3].?.value(63).?);
}

test "JPEG table store malformed second definitions and limits roll back whole segment" {
    var store: Store = .{};
    try store.installQuantization(&quantization, .{});
    try store.installHuffman(&dc, .{});
    const original_q = store.quantization[0].?.raw.ptr;
    const original_h = store.huffman[0][0].?.symbols.ptr;
    const qs = (.{0} ++ [_]u8{2} ** 64) ++ quantization;
    const hs = dc ++ dc;
    for (1..65) |n| {
        try t.expectError(error.UnexpectedEnd, store.installQuantization(qs[0 .. 65 + n], .{}));
        try t.expect(store.quantization[0].?.raw.ptr == original_q);
    }
    for (1..18) |n| {
        try t.expectError(error.UnexpectedEnd, store.installHuffman(hs[0 .. 18 + n], .{}));
        try t.expect(store.huffman[0][0].?.symbols.ptr == original_h);
    }
    try t.expectError(error.LimitExceeded, store.installQuantization(&qs, .{ .max_tables = 1 }));
    try t.expectError(error.LimitExceeded, store.installHuffman(&hs, .{ .cursor = .{ .max_tables = 1 } }));
    try t.expect(store.quantization[0].?.raw.ptr == original_q);
    try t.expect(store.huffman[0][0].?.symbols.ptr == original_h);
}

test "JPEG resolved sequential scan requires both tables but not unused destinations" {
    const frame = try frame_parser.parse(0xc0, &frame_bytes, .{});
    var store: Store = .{};
    try t.expectError(error.MissingJpegQuantizationTable, scan_tables.resolve(&store, frame, &sequential));
    try store.installQuantization(&quantization, .{});
    try t.expectError(error.MissingJpegHuffmanTable, scan_tables.resolve(&store, frame, &sequential));
    try store.installHuffman(&dc, .{});
    try t.expectError(error.MissingJpegHuffmanTable, scan_tables.resolve(&store, frame, &sequential));
    try store.installHuffman(&ac, .{});
    const resolved = try scan_tables.resolve(&store, frame, &sequential);
    try t.expectEqual(@as(usize, 1), resolved.count);
    try t.expectEqual(@as(u8, 9), resolved.components[0].id);
    try t.expect(resolved.components[0].dc != null and resolved.components[0].ac != null);
    try t.expect(resolved.symbol_semantics_deferred);
    // Merely defining an unused empty table is distinct from selecting it.
    try store.installHuffman(&([_]u8{0} ** 17), .{});
    try t.expectError(error.EmptyJpegHuffmanTable, scan_tables.resolve(&store, frame, &sequential));
}

test "JPEG progressive table needs distinguish first DC refinement DC and AC scans" {
    const frame = try frame_parser.parse(0xc2, &frame_bytes, .{});
    var store: Store = .{};
    try store.installQuantization(&quantization, .{});
    const first = [_]u8{ 1, 9, 0, 0, 0, 1 };
    const refinement = [_]u8{ 1, 9, 0x33, 0, 0, 0x10 };
    const first_ac = [_]u8{ 1, 9, 0, 1, 63, 1 };
    const refine_ac = [_]u8{ 1, 9, 0, 1, 63, 0x10 };
    try t.expectError(error.MissingJpegHuffmanTable, scan_tables.resolve(&store, frame, &first));
    const refined = try scan_tables.resolve(&store, frame, &refinement);
    try t.expect(refined.components[0].dc == null and refined.components[0].ac == null);
    try store.installHuffman(&dc, .{});
    const initial = try scan_tables.resolve(&store, frame, &first);
    try t.expect(initial.components[0].dc != null and initial.components[0].ac == null);
    try t.expectError(error.MissingJpegHuffmanTable, scan_tables.resolve(&store, frame, &first_ac));
    try t.expectError(error.MissingJpegHuffmanTable, scan_tables.resolve(&store, frame, &refine_ac));
    try store.installHuffman(&ac, .{});
    for ([_][]const u8{ &first_ac, &refine_ac }) |bytes| {
        const result = try scan_tables.resolve(&store, frame, bytes);
        try t.expect(result.components[0].dc == null and result.components[0].ac != null);
    }
}

test "JPEG lossless uses DC only and arithmetic tables are explicitly unsupported" {
    const frame = try frame_parser.parse(0xc3, &frame_bytes, .{});
    const bytes = [_]u8{ 1, 9, 0, 1, 0, 0 };
    var store: Store = .{};
    try store.installHuffman(&dc, .{});
    const result = try scan_tables.resolve(&store, frame, &bytes);
    try t.expect(result.components[0].quantization == null and result.components[0].ac == null);
    try t.expect(result.components[0].dc != null);
    const arithmetic = try frame_parser.parse(0xcb, &frame_bytes, .{});
    try t.expectError(error.UnsupportedJpegArithmeticTables, scan_tables.resolve(&store, arithmetic, &bytes));
}

test "JPEG scan subset resolves nonnumeric frame IDs and distinct table destinations" {
    const bytes = [_]u8{ 8, 0, 1, 0, 1, 3, 9, 0x11, 2, 4, 0x11, 0, 7, 0x11, 3 };
    const frame = try frame_parser.parse(0xc1, &bytes, .{});
    const payload = [_]u8{ 2, 4, 0x10, 7, 0x32, 0, 63, 0 };
    var store: Store = .{};
    const qs = quantization ++ (.{3} ++ [_]u8{8} ** 64);
    const hs = (.{1} ++ dc[1..].*) ++ ac ++ (.{3} ++ dc[1..].*) ++ (.{18} ++ ac[1..].*);
    try store.installQuantization(&qs, .{});
    try store.installHuffman(&hs, .{});
    const result = try scan_tables.resolve(&store, frame, &payload);
    try t.expectEqual(@as(usize, 2), result.count);
    try t.expectEqual(@as(u8, 4), result.components[0].id);
    try t.expectEqual(@as(u8, 7), result.components[1].id);
    try t.expectEqual(@as(u16, 1), result.components[0].quantization.?.value(63).?);
    try t.expectEqual(@as(u16, 8), result.components[1].quantization.?.value(63).?);
    try t.expectEqual(@as(u8, 1), result.components[0].dc.?.destination);
    try t.expectEqual(@as(u8, 0), result.components[0].ac.?.destination);
    try t.expectEqual(@as(u8, 3), result.components[1].dc.?.destination);
    try t.expectEqual(@as(u8, 2), result.components[1].ac.?.destination);
    // The missing table for frame component 9 must not affect this scan subset.
    try t.expect(store.quantization[2] == null);
}

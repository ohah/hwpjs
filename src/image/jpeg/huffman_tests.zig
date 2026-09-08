const std = @import("std");
const t = std.testing;
const h = @import("huffman.zig");
const lengths = @import("huffman_lengths.zig");
const fixture = .{ 0, 1, 1 } ++ [_]u8{0} ** 14 ++ .{ 0, 5 };
test "JPEG DHT selector byte matrix and borrowed symbol order" {
    for (0..256) |selector| {
        var bytes: [19]u8 = fixture;
        bytes[0] = @intCast(selector);
        var it = try h.Iterator.init(&bytes, .{});
        if (selector >> 4 > 1 or selector & 15 > 3) {
            try t.expectError(error.InvalidJpegTableSelector, it.next());
            try t.expectEqual(@as(usize, 0), it.cursor.reader.offset);
        } else {
            const table = (try it.next()).?;
            try t.expectEqual(@as(u8, @intCast(selector & 15)), table.destination);
            try t.expectEqual(@as(u8, @intCast(selector >> 4)), table.class);
            try t.expectEqualSlices(u8, &.{ 0, 5 }, table.symbols);
            try t.expect(table.symbols.ptr == bytes[17..].ptr);
            try t.expectEqual(@as(u32, 16384), table.unused_code_slots);
            try t.expect(table.symbol_semantics_deferred);
        }
    }
}
test "JPEG Huffman length capacity matrix reserves all ones code" {
    for (0..16) |index| for (0..256) |count| {
        var bits = [_]u8{0} ** 16;
        bits[index] = @intCast(count);
        const capacity = @as(u32, 1) << @as(u5, @intCast(index + 1));
        if (count >= capacity) {
            try t.expectError(error.InvalidJpegHuffmanCodeSpace, lengths.inspect(&bits));
        } else {
            const report = try lengths.inspect(&bits);
            try t.expectEqual(count, report.symbols);
            try t.expectEqual(@as(u32, 65536) - @as(u32, @intCast(count)) * (65536 / capacity), report.unused_code_slots);
        }
    };
    var full = [_]u8{1} ** 16;
    try t.expectEqual(@as(u32, 1), (try lengths.inspect(&full)).unused_code_slots);
    full[15] = 2;
    try t.expectError(error.InvalidJpegHuffmanCodeSpace, lengths.inspect(&full));
}
test "JPEG DHT empty symbol lists and duplicates do not certify symbol semantics" {
    var empty = try h.Iterator.init(&([_]u8{0} ** 17), .{ .max_symbols = 0 });
    const table = (try empty.next()).?;
    try t.expectEqual(@as(usize, 0), table.symbols.len);
    try t.expectEqual(@as(u32, 65536), table.unused_code_slots);
    var bytes: [19]u8 = fixture;
    bytes[18] = bytes[17];
    var it = try h.Iterator.init(&bytes, .{});
    try t.expect((try it.next()).?.symbol_semantics_deferred);
}
test "JPEG DHT all truncations budgets and repeated destinations" {
    const bytes: [19]u8 = fixture;
    try t.expectError(error.EmptyJpegTableSegment, h.Iterator.init(&.{}, .{}));
    for (1..bytes.len) |size| {
        var it = try h.Iterator.init(bytes[0..size], .{});
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectEqual(@as(usize, 0), it.cursor.reader.offset);
        try t.expectEqual(@as(usize, 0), it.cursor.count);
    }
    var it = try h.Iterator.init(&(fixture ++ fixture), .{ .max_symbols = 1 });
    try t.expectError(error.LimitExceeded, it.next());
    it.max_symbols = 2;
    _ = try it.next();
    _ = try it.next();
    try t.expect((try it.next()) == null);
    try t.expectEqual(@as(usize, 2), it.cursor.count);
    var limited = try h.Iterator.init(&bytes, .{ .cursor = .{ .max_tables = 0 } });
    try t.expectError(error.LimitExceeded, limited.next());
}
test "JPEG Huffman table use constraints do not reject unused definitions" {
    const p = @import("process.zig");
    var bytes: [19]u8 = fixture;
    bytes[0] = 0x12;
    var it = try h.Iterator.init(&bytes, .{});
    const table = (try it.next()).?;
    try t.expectError(error.InvalidJpegEntropySelector, table.validateForProcess(try p.fromMarker(0xc0)));
    try t.expectError(error.InvalidJpegHuffmanClass, table.validateForProcess(try p.fromMarker(0xc3)));
    try t.expectError(error.UnsupportedJpegHuffmanProcess, table.validateForProcess(try p.fromMarker(0xc9)));
    try table.validateForProcess(try p.fromMarker(0xc1));
    try table.validateForProcess(try p.fromMarker(0xc2));
}

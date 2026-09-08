const std = @import("std");
const t = std.testing;
const q = @import("quantization.zig");
const eight = .{0} ++ [_]u8{1} ** 64;
fn wide() [129]u8 {
    var bytes = [_]u8{0} ** 129;
    bytes[0] = 0x10;
    for (0..64) |i| std.mem.writeInt(u16, bytes[1 + 2 * i ..][0..2], 1, .big);
    return bytes;
}
test "JPEG DQT selector byte matrix and borrowed zigzag values" {
    for (0..256) |selector| {
        var bytes = wide();
        bytes[0] = @intCast(selector);
        const valid = selector >> 4 <= 1 and selector & 15 <= 3;
        var it = try q.Iterator.init(bytes[0..if (selector >> 4 == 0) @as(usize, 65) else 129], .{});
        if (!valid) {
            try t.expectError(error.InvalidJpegTableSelector, it.next());
            try t.expectEqual(@as(usize, 0), it.cursor.reader.offset);
        } else {
            if (selector >> 4 == 0) @memset(bytes[1..65], 1);
            const table = (try it.next()).?;
            try t.expectEqual(@as(u8, @intCast(selector & 15)), table.destination);
            try t.expect(table.raw.ptr == bytes[1..].ptr);
            try t.expectEqual(@as(?u16, 1), table.value(63));
            try t.expectEqual(@as(?u16, null), table.value(64));
            try t.expectEqual(@as(?u16, null), table.value(std.math.maxInt(usize)));
            try t.expect((try it.next()) == null);
        }
    }
}
test "JPEG DQT every byte at every index and all wide values" {
    var bytes: [65]u8 = eight;
    for (0..64) |index| for (0..256) |value| {
        bytes[index + 1] = @intCast(value);
        var it = try q.Iterator.init(&bytes, .{});
        if (value == 0) {
            try t.expectError(error.InvalidJpegQuantizationValue, it.next());
            try t.expectEqual(@as(usize, 0), it.cursor.count);
            try t.expectEqual(@as(usize, 0), it.cursor.reader.offset);
        } else try t.expectEqual(@as(?u16, @intCast(value)), (try it.next()).?.value(index));
        bytes[index + 1] = 1;
    };
    var w = wide();
    for (0..65536) |value| {
        std.mem.writeInt(u16, w[127..129], @intCast(value), .big);
        var it = try q.Iterator.init(&w, .{});
        if (value == 0) try t.expectError(error.InvalidJpegQuantizationValue, it.next()) else try t.expectEqual(@as(?u16, @intCast(value)), (try it.next()).?.value(63));
    }
}
test "JPEG DQT truncation repeated destinations and table budgets" {
    const bytes = wide();
    try t.expectError(error.EmptyJpegTableSegment, q.Iterator.init(&.{}, .{}));
    for (1..bytes.len) |size| {
        var it = try q.Iterator.init(bytes[0..size], .{});
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectEqual(@as(usize, 0), it.cursor.reader.offset);
    }
    var it = try q.Iterator.init(&(eight ++ eight), .{ .max_tables = 1 });
    _ = try it.next();
    try t.expectError(error.LimitExceeded, it.next());
    try t.expectEqual(@as(usize, 65), it.cursor.reader.offset);
    it.cursor.options.max_tables = 2;
    try t.expectEqual(@as(u8, 0), (try it.next()).?.destination);
    try t.expect((try it.next()) == null);
    try t.expectError(error.LimitExceeded, q.Iterator.init(&bytes, .{ .max_bytes = bytes.len - 1 }));
}
test "JPEG DQT 16 bit use is rejected for all 8 bit DCT frame types" {
    const bytes = wide();
    var it = try q.Iterator.init(&bytes, .{});
    const table = (try it.next()).?;
    var f = [_]u8{ 8, 0, 1, 0, 1, 1, 0, 17, 0 };
    for ([_]u8{ 0xc0, 0xc1, 0xc2, 0xc9, 0xca }) |code| {
        f[0] = 8;
        try t.expectError(error.InvalidJpegQuantizationPrecision, table.validateForFrame(try @import("frame.zig").parse(code, &f, .{})));
        if (code != 0xc0) {
            f[0] = 12;
            try table.validateForFrame(try @import("frame.zig").parse(code, &f, .{}));
        }
    }
    try t.expectError(error.UnsupportedJpegQuantizationProcess, table.validateForFrame(try @import("frame.zig").parse(0xc3, &f, .{})));
}

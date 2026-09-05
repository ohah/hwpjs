const std = @import("std");
const d = @import("reader.zig");

test "DocInfo properties use 26 bytes and retain extension bytes" {
    var bytes: [29]u8 = undefined;
    for (&bytes, 0..) |*b, i| b.* = @intCast(i + 1);
    for (0..26) |n| try std.testing.expectError(error.UnexpectedEnd, d.Properties.parse(bytes[0..n]));
    const p = try d.Properties.parse(&bytes);
    try std.testing.expectEqual(@as(u16, 0x0201), p.section_count);
    try std.testing.expectEqual(@as(u16, 0x0e0d), p.equation_start);
    try std.testing.expectEqual(@as(u32, 0x1211100f), p.caret_list);
    try std.testing.expectEqual(@as(u32, 0x1a191817), p.caret_character);
    try std.testing.expectEqualSlices(u8, bytes[26..], p.extra);
}

test "ID mappings distinguish version expectations presence zero and signed values" {
    var bytes = [_]u8{0} ** 80;
    std.mem.writeInt(i32, bytes[0..4], -1, .little);
    for (0..60) |n| try std.testing.expectError(error.UnexpectedEnd, d.IdMappings.parse(bytes[0..n], .{ .raw = 0x05000107 }));
    for ([_]u32{ 0x05000200, 0x05000201, 0x05000301, 0x05000302, 0x05010001 }, [_]usize{ 15, 16, 16, 18, 18 }) |version, expected| {
        for (60..81) |n| {
            if (n % 4 != 0) {
                try std.testing.expectError(error.InvalidMappingSize, d.IdMappings.parse(bytes[0..n], .{ .raw = version }));
                continue;
            }
            const m = try d.IdMappings.parse(bytes[0..n], .{ .raw = version });
            try std.testing.expectEqual(expected, m.expectedCount());
            try std.testing.expectEqual(@as(?i32, -1), m.get(.bin_data));
            try std.testing.expectEqual(if (n >= 64) @as(?i32, 0) else null, m.get(.memo_shape));
            try std.testing.expectEqual(if (n >= 72) @as(?i32, 0) else null, m.get(.track_change_author));
            try std.testing.expectEqual(n - @min(n, 72), m.extra().len);
        }
    }
}

test "DocInfo semantic errors are atomic and unknown records survive" {
    const good = [_]u8{ 16, 0, 160, 1 } ++ [_]u8{0} ** 26;
    var bad = good;
    bad[1] = 4; // level 1
    var it = try d.Iterator.init(&bad, .{ .raw = 0x05000107 }, .{});
    try std.testing.expectError(error.InvalidDocInfoLevel, it.next());
    try std.testing.expectEqual(@as(usize, 0), it.records.reader.offset);
    try std.testing.expectEqual(@as(usize, 0), it.records.count);
    it = try d.Iterator.init(&.{ 16, 0, 0, 0 }, .{ .raw = 0x05000107 }, .{});
    try std.testing.expectError(error.UnexpectedEnd, it.next());
    try std.testing.expectEqual(@as(usize, 0), it.records.reader.offset);
    const bytes = good ++ .{ 255, 255, 15, 0 };
    it = try d.Iterator.init(&bytes, .{ .raw = 0x05000107 }, .{});
    try std.testing.expect((try it.next()).?.value == .properties);
    const unknown = (try it.next()).?;
    try std.testing.expect(unknown.value == .unknown);
    try std.testing.expectEqualSlices(u8, bytes[30..], unknown.framing.raw);
    try std.testing.expect(try it.next() == null);
    try std.testing.expectError(error.UnsupportedVersion, d.Iterator.init(&bytes, .{ .raw = 0x06000000 }, .{}));
}

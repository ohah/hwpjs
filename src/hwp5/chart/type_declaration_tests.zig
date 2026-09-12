const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const declaration = @import("type_declaration.zig");

test "chart declaration respects caller offset and borrows exact name bytes" {
    const wire = [_]u8{ 8, 0, 'V', 't', 'C', 'h', 'a', 'r', 't', 0, 6, 0 };
    for ([_]usize{ 0, 1, 17, 96 }) |offset| {
        var bytes = [_]u8{0xaa} ** 112;
        @memcpy(bytes[offset..][0..wire.len], &wire);
        var reader: Reader = .{ .bytes = &bytes, .offset = offset };
        const value = try declaration.readObserved16(&reader, 8);
        try t.expectEqualSlices(u8, wire[2..10], value.raw_name);
        try t.expect(value.raw_name.ptr == bytes[offset + 2 ..].ptr);
        try t.expectEqual(@as(u16, 6), value.version);
        try t.expectEqual(offset + wire.len, reader.offset);
        try t.expectEqual(@as(u8, 0xaa), try reader.readInt(u8));
    }
}

test "chart declaration all cuts and malformed names preserve caller state" {
    const bytes = [_]u8{ 0xaa, 8, 0, 'V', 't', 'C', 'h', 'a', 'r', 't', 0, 6, 0 };
    for (1..bytes.len) |cut| {
        var reader: Reader = .{ .bytes = bytes[0..cut], .offset = 1 };
        try t.expectError(error.UnexpectedEnd, declaration.readObserved16(&reader, 8));
        try t.expectEqual(@as(usize, 1), reader.offset);
    }
    var reader: Reader = .{ .bytes = &bytes, .offset = 1 };
    try t.expectError(error.LimitExceeded, declaration.readObserved16(&reader, 7));
    try t.expectEqual(@as(usize, 1), reader.offset);
    var bad = bytes;
    bad[10] = 1;
    reader.bytes = &bad;
    try t.expectError(error.InvalidChartTypeName, declaration.readObserved16(&reader, 8));
    try t.expectEqual(@as(usize, 1), reader.offset);
    reader = .{ .bytes = &.{ 0, 0, 1, 0 } };
    try t.expectError(error.InvalidChartTypeName, declaration.readObserved16(&reader, 8));
    try t.expectEqual(@as(usize, 0), reader.offset);
    reader.offset = std.math.maxInt(usize);
    try t.expectError(error.UnexpectedEnd, declaration.readObserved16(&reader, 8));
    try t.expectEqual(std.math.maxInt(usize), reader.offset);
}

test "chart declaration retains opaque names and full unsigned version range" {
    for ([_]u16{ 1, 7, 8, 255, 256, 65535 }) |length| {
        const bytes = try t.allocator.alloc(u8, @as(usize, length) + 4);
        defer t.allocator.free(bytes);
        @memset(bytes, 0xff);
        std.mem.writeInt(u16, bytes[0..2], length, .little);
        bytes[1 + @as(usize, length)] = 0;
        for ([_]u16{ 0, 1, 6, 256, 32768, 65535 }) |version| {
            std.mem.writeInt(u16, bytes[2 + @as(usize, length) ..][0..2], version, .little);
            var reader: Reader = .{ .bytes = bytes };
            const value = try declaration.readObserved16(&reader, length);
            try t.expectEqual(version, value.version);
            try t.expectEqual(length, value.raw_name.len);
            try t.expectEqualSlices(u8, bytes[2 .. 2 + @as(usize, length)], value.raw_name);
            try t.expectEqual(bytes.len, reader.offset);
        }
    }
}

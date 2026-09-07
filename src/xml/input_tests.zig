const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");

test "XML character production covers every Unicode value without banning discouraged characters" {
    for (0..0x110001) |n| {
        const c: u32 = @intCast(n);
        const forbidden = c > 0x10ffff or (c < 32 and c != 9 and c != 10 and c != 13) or (c >= 0xd800 and c < 0xe000) or c == 0xfffe or c == 0xffff;
        try t.expectEqual(!forbidden, xml.characters.valid(c));
    }
    try t.expect(!xml.characters.valid(std.math.maxInt(u32)));
}

test "all Unicode scalar values roundtrip through UTF8 and both UTF16 byte orders" {
    for (0..0x110000) |n| {
        if (n >= 0xd800 and n <= 0xdfff) continue;
        const c: u21 = @intCast(n);
        var encoded: [4]u8 = undefined;
        const len = try std.unicode.utf8Encode(c, &encoded);
        const decoded = (try xml.scalars.read(encoded[0..len], 0, .utf8)).?;
        try t.expectEqual(c, decoded.value);
        try t.expectEqual(@as(usize, len), decoded.end);
        inline for (.{ xml.input.Encoding.utf16le, xml.input.Encoding.utf16be }) |encoding| {
            const order: std.builtin.Endian = if (encoding == .utf16le) .little else .big;
            const count: usize = if (c < 0x10000) 2 else 4;
            if (count == 2) {
                std.mem.writeInt(u16, encoded[0..2], @intCast(c), order);
            } else {
                std.mem.writeInt(u16, encoded[0..2], @intCast(0xd800 + (c - 0x10000) / 1024), order);
                std.mem.writeInt(u16, encoded[2..4], @intCast(0xdc00 + (c - 0x10000) % 1024), order);
            }
            const result = (try xml.scalars.read(encoded[0..count], 0, encoding)).?;
            try t.expectEqual(c, result.value);
            try t.expectEqual(count, result.end);
        }
    }
}

test "XML input normalizes literal CR and CRLF with exact spans and budgets" {
    inline for (.{ xml.input.Encoding.utf16le, xml.input.Encoding.utf16be }) |encoding| {
        const bytes: []const u8 = if (encoding == .utf16le) &.{ 13, 0, 10, 0, 65, 0 } else &.{ 0, 13, 0, 10, 0, 65 };
        var wide = try xml.input.Input.init(bytes, encoding, .{ .max_bytes = 6, .max_characters = 2 });
        try t.expectEqual(xml.input.Character{ .value = 10, .start = 0, .end = 4 }, (try wide.next()).?);
        try t.expectEqual(xml.input.Character{ .value = 65, .start = 4, .end = 6 }, (try wide.next()).?);
        try t.expectEqual(null, try wide.next());
    }
    var input = try xml.input.Input.init("\r\n\r\r\n\nA\xc2\x85\xe2\x80\xa8", .utf8, .{ .max_characters = 7 });
    const expected = [_][3]usize{ .{ 10, 0, 2 }, .{ 10, 2, 3 }, .{ 10, 3, 5 }, .{ 10, 5, 6 }, .{ 65, 6, 7 }, .{ 0x85, 7, 9 }, .{ 0x2028, 9, 12 } };
    for (expected) |e| {
        const c = (try input.next()).?;
        try t.expectEqual(e[0], c.value);
        try t.expectEqual(e[1], c.start);
        try t.expectEqual(e[2], c.end);
    }
    try t.expectEqual(@as(usize, 0), input.remaining);
    try t.expectEqual(null, try input.next());
    var empty = try xml.input.Input.init("", .utf8, .{ .max_bytes = 0, .max_characters = 0 });
    try t.expectEqual(null, try empty.next());
    try t.expectError(error.LimitExceeded, xml.input.Input.init("x", .utf8, .{ .max_bytes = 0 }));
    var limited = try xml.input.Input.init("xy", .utf8, .{ .max_bytes = 2, .max_characters = 1 });
    _ = try limited.next();
    try t.expectError(error.LimitExceeded, limited.next());
    try t.expectEqual(@as(usize, 1), limited.offset);
    try t.expectEqual(@as(usize, 0), limited.remaining);
}

test "invalid encoding and forbidden characters never advance or substitute" {
    const Case = struct { bytes: []const u8, encoding: xml.input.Encoding, err: anyerror };
    const cases = [_]Case{
        .{ .bytes = "\xc0\x80", .encoding = .utf8, .err = error.InvalidXmlEncoding },
        .{ .bytes = "\xed\xa0\x80", .encoding = .utf8, .err = error.InvalidXmlEncoding },
        .{ .bytes = "\xf4\x90\x80\x80", .encoding = .utf8, .err = error.InvalidXmlEncoding },
        .{ .bytes = "\x80", .encoding = .utf8, .err = error.InvalidXmlEncoding },
        .{ .bytes = "\xe2\x82", .encoding = .utf8, .err = error.UnexpectedEnd },
        .{ .bytes = "\x00", .encoding = .utf8, .err = error.InvalidXmlCharacter },
        .{ .bytes = "\xef\xbf\xbe", .encoding = .utf8, .err = error.InvalidXmlCharacter },
        .{ .bytes = "\x00\xdc", .encoding = .utf16le, .err = error.InvalidXmlEncoding },
        .{ .bytes = "\xd8\x00\x00\x41", .encoding = .utf16be, .err = error.InvalidXmlEncoding },
        .{ .bytes = "\x00\xd8", .encoding = .utf16le, .err = error.UnexpectedEnd },
        .{ .bytes = "\x00", .encoding = .utf16be, .err = error.UnexpectedEnd },
    };
    for (cases) |case| {
        var input = try xml.input.Input.init(case.bytes, case.encoding, .{});
        const remaining = input.remaining;
        for (0..2) |_| try t.expectError(case.err, input.next());
        try t.expectEqual(@as(usize, 0), input.offset);
        try t.expectEqual(remaining, input.remaining);
    }
    try t.expectError(error.UnexpectedEnd, xml.scalars.read("", std.math.maxInt(usize), .utf8));
}

test "BOM and references stay literal and trailing invalid bytes are not skipped after CR" {
    var input = try xml.input.Input.init("\xef\xbb\xbf&#13;\r\xff", .utf8, .{});
    for ([_]u21{ 0xfeff, '&', '#', '1', '3', ';', 10 }) |c| try t.expectEqual(c, (try input.next()).?.value);
    const offset = input.offset;
    try t.expectError(error.InvalidXmlEncoding, input.next());
    try t.expectEqual(offset, input.offset);
}

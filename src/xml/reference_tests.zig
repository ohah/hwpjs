const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");
test "XML Name classes use explicit ranges and preserve Unicode spelling" {
    const starts = [_]u32{ ':', '_', 'A', 'z', 0xc0, 0xd6, 0xd8, 0xf6, 0xf8, 0x2ff, 0x370, 0x37d, 0x37f, 0x1fff, 0x200c, 0x200d, 0x2070, 0x218f, 0x2c00, 0x2fef, 0x3001, 0xd7ff, 0xf900, 0xfdcf, 0xfdf0, 0xfffd, 0x10000, 0xeffff };
    for (starts) |c| try t.expect(xml.characters.nameStart(c) and xml.characters.nameContinue(c));
    for ([_]u32{ '0', '-', '.', 0xb7, 0x300, 0x36f, 0x203f, 0x2040 }) |c| try t.expect(!xml.characters.nameStart(c) and xml.characters.nameContinue(c));
    for ([_]u32{ 0, ' ', '@', '[', 0xbf, 0xd7, 0xf7, 0x37e, 0x200b, 0x200e, 0x206f, 0x2190, 0x2bff, 0x2ff0, 0x3000, 0xd800, 0xf8ff, 0xfdd0, 0xfdef, 0xfffe, 0xf0000, 0x10ffff, 0xffffffff }) |c| try t.expect(!xml.characters.nameContinue(c));
    var input = try xml.input.Input.init("한글:😀-1\u{0300};", .utf8, .{});
    const name = try xml.names.parse(&input, 64);
    try t.expectEqualStrings("한글:😀-1\u{0300}", name.raw);
    try t.expectEqual(@as(u21, ';'), (try input.next()).?.value);
    var colon = try xml.input.Input.init(":a:b", .utf8, .{});
    try t.expectEqualStrings(":a:b", (try xml.names.parse(&colon, 4)).raw); // Not QName validation.
}
test "XML references distinguish numeric predefined and unresolved names without re-normalizing CR" {
    const cases = .{ .{ "&#13;", @as(u21, 13) }, .{ "&#xD;", @as(u21, 13) }, .{ "&#00065;", @as(u21, 65) }, .{ "&#x10FFFF;", @as(u21, 0x10ffff) }, .{ "&#xFDD0;", @as(u21, 0xfdd0) } };
    inline for (cases) |case| {
        var input = try xml.input.Input.init(case[0], .utf8, .{ .max_characters = case[0].len });
        const ref = try xml.references.parse(&input, .{ .max_bytes = case[0].len });
        try t.expectEqual(case[1], ref.value.numeric);
        try t.expectEqualStrings(case[0], ref.raw);
        try t.expectEqual(@as(usize, 0), input.remaining);
    }
    inline for (.{ .{ "&lt;", '<' }, .{ "&gt;", '>' }, .{ "&amp;", '&' }, .{ "&apos;", '\'' }, .{ "&quot;", '"' } }) |case| {
        var input = try xml.input.Input.init(case[0], .utf8, .{});
        try t.expectEqual(@as(u21, case[1]), (try xml.references.parse(&input, .{})).value.predefined);
    }
    for ([_][]const u8{ "&AMP;", "&custom;", "&한글;", "&a:b;" }) |raw| {
        var input = try xml.input.Input.init(raw, .utf8, .{});
        const ref = try xml.references.parse(&input, .{});
        try t.expectEqualStrings(raw[1 .. raw.len - 1], ref.value.unresolved.raw);
    }
}
test "XML reference errors and limits roll back input and budget" {
    for ([_][]const u8{ "", "&", "&#", "&#x", "&#;", "&#x;", "&#X41;", "&#-1;", "&# 65;", "&#xG;", "&#1A;", "&amp", "&amp x;", "&;", "&1name;", "&#0;", "&#xD800;", "&#xFFFF;", "&#1114112;", "&#9999999999999999999999999;" }) |raw| {
        var input = try xml.input.Input.init(raw, .utf8, .{});
        const before = input;
        if (xml.references.parse(&input, .{})) |_| return error.ExpectedRejection else |_| {}
        try t.expectEqual(before.offset, input.offset);
        try t.expectEqual(before.remaining, input.remaining);
    }
    var input = try xml.input.Input.init("&amp;Z", .utf8, .{});
    try t.expectError(error.LimitExceeded, xml.references.parse(&input, .{ .max_bytes = 4 }));
    try t.expectError(error.LimitExceeded, xml.references.parse(&input, .{ .max_name_bytes = 2 }));
    try t.expectEqual(@as(usize, 0), input.offset);
    _ = try xml.references.parse(&input, .{ .max_bytes = 5, .max_name_bytes = 3 });
    try t.expectEqual(@as(u21, 'Z'), (try input.next()).?.value);
}
test "UTF16 references preserve byte limits and borrowing in both byte orders" {
    const ascii = "&#x1F600;&amp;";
    inline for (.{ xml.input.Encoding.utf16le, xml.input.Encoding.utf16be }) |encoding| {
        var raw: [ascii.len * 2]u8 = undefined;
        for (ascii, 0..) |c, i| std.mem.writeInt(u16, raw[i * 2 ..][0..2], c, if (encoding == .utf16le) .little else .big);
        const before = raw;
        var input = try xml.input.Input.init(&raw, encoding, .{});
        const first = try xml.references.parse(&input, .{ .max_bytes = 18 });
        try t.expectEqual(@as(u21, 0x1f600), first.value.numeric);
        try t.expectEqual(@intFromPtr(&raw), @intFromPtr(first.raw.ptr));
        try t.expectError(error.LimitExceeded, xml.references.parse(&input, .{ .max_bytes = 9 }));
        try t.expectEqual(@as(usize, 18), input.offset);
        try t.expectEqual(@as(u21, '&'), (try xml.references.parse(&input, .{ .max_bytes = 10 })).value.predefined);
        try t.expectEqualSlices(u8, &before, &raw);
    }
}

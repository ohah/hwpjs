const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");
test "XML declarations preserve values and consume only the declaration" {
    const raw = "<?xml\r\nversion = '1.123' encoding=\"uTf-8\" standalone = 'no' ?><x/>";
    var input = try xml.input.Input.init(raw, .utf8, .{});
    const report = (try xml.declaration.parse(&input, 4096)).?;
    try t.expect(report.version.equals("1.123", false));
    try t.expect(report.encoding.?.equals("UTF-8", true));
    try t.expect(!report.encoding.?.equals("UTF-8", false));
    try t.expectEqual(false, report.standalone.?);
    try t.expectEqualStrings("<x/>", input.bytes[input.offset..]);
    try t.expectEqual(@intFromPtr(raw.ptr), @intFromPtr(report.raw.ptr));
}
test "malformed declarations and limits leave cursor and budget unchanged" {
    for ([_][]const u8{
        "<?xml version='1.'?>",                   "<?xml version='2.0'?>",                 "<?xml version='1.0'encoding='UTF-8'?>",
        "<?xml encoding='UTF-8' version='1.0'?>", "<?xml version='1.0' version='1.0'?>",   "<?xml version='1.0' standalone='yes' encoding='UTF-8'?>",
        "<?xml version='1.0' standalone='YES'?>", "<?xml version='1.0' encoding='1bad'?>", "<?xml version='1.0' encoding='UTF 8'?>",
        "<?xml version='1.0' encoding=''?>",      "<?xml version='1.0' extra='x'?>",       "<?xml version='1.&#48;'?>",
    }) |raw| {
        var input = try xml.input.Input.init(raw, .utf8, .{});
        const before = input;
        try t.expectError(error.InvalidXmlDeclaration, xml.declaration.parse(&input, 4096));
        try t.expectEqual(before.offset, input.offset);
        try t.expectEqual(before.remaining, input.remaining);
    }
    const raw = "<?xml version='1.0'?>";
    for (6..raw.len) |end| {
        var input = try xml.input.Input.init(raw[0..end], .utf8, .{});
        try t.expectError(error.UnexpectedEnd, xml.declaration.parse(&input, 4096));
        try t.expectEqual(@as(usize, 0), input.offset);
    }
    var exact = try xml.input.Input.init(raw, .utf8, .{ .max_characters = raw.len });
    try t.expect((try xml.declaration.parse(&exact, raw.len)) != null);
    var short = try xml.input.Input.init(raw, .utf8, .{});
    try t.expectError(error.LimitExceeded, xml.declaration.parse(&short, raw.len - 1));
    try t.expectEqual(@as(usize, 0), short.offset);
}
test "PI prefixes and absence do not consume input; UTF16 declarations borrow raw bytes" {
    for ([_][]const u8{ "", "<x/>", "<?xml-stylesheet x?>", " <?xml version='1.0'?>", "<?XML version='1.0'?>" }) |raw| {
        var input = try xml.input.Input.init(raw, .utf8, .{});
        const before = input;
        try t.expectEqual(null, try xml.declaration.parse(&input, 0));
        try t.expectEqual(before.offset, input.offset);
        try t.expectEqual(before.remaining, input.remaining);
    }
    const ascii = "<?xml version='1.0' standalone='yes'?>";
    inline for (.{ xml.input.Encoding.utf16le, xml.input.Encoding.utf16be }) |encoding| {
        var raw: [ascii.len * 2]u8 = undefined;
        for (ascii, 0..) |c, i| std.mem.writeInt(u16, raw[i * 2 ..][0..2], c, if (encoding == .utf16le) .little else .big);
        var input = try xml.input.Input.init(&raw, encoding, .{});
        const declaration = (try xml.declaration.parse(&input, raw.len)).?;
        try t.expect(declaration.version.equals("1.0", false));
        try t.expectEqual(true, declaration.standalone.?);
        try t.expectEqual(null, declaration.encoding);
        try t.expectEqual(raw.len, input.offset);
    }
}

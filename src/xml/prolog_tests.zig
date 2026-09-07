const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");
const Encoding = xml.input.Encoding;
fn encode(text: []const u8, encoding: Encoding, bom: bool) ![]u8 {
    const signature: []const u8 = if (!bom) "" else switch (encoding) {
        .utf8 => "\xef\xbb\xbf",
        .utf16le => "\xff\xfe",
        .utf16be => "\xfe\xff",
    };
    const width: usize = if (encoding == .utf8) 1 else 2;
    const bytes = try t.allocator.alloc(u8, signature.len + text.len * width);
    @memcpy(bytes[0..signature.len], signature);
    for (text, 0..) |c, i| {
        const at = signature.len + i * width;
        if (width == 1) bytes[at] = c else std.mem.writeInt(u16, bytes[at..][0..2], c, if (encoding == .utf16le) .little else .big);
    }
    return bytes;
}
test "XML prolog BOM external encoding and declared encoding matrix" {
    inline for (.{ Encoding.utf8, Encoding.utf16le, Encoding.utf16be }) |encoding| {
        const name = switch (encoding) {
            .utf8 => "UTF-8",
            .utf16le => "UTF-16LE",
            .utf16be => "UTF-16BE",
        };
        const source = "<?xml version='1.0' encoding='" ++ name ++ "'?><x/>";
        inline for (.{ false, true }) |bom| {
            const bytes = try encode(source, encoding, bom);
            defer t.allocator.free(bytes);
            for ([_]?Encoding{ null, encoding }) |external| {
                var result = try xml.prolog.open(bytes, .{ .external_encoding = external });
                try t.expectEqual(encoding, result.input.encoding);
                try t.expect(result.declaration.?.encoding.?.equals(name, false));
                try t.expectEqual(@as(u21, '<'), (try result.input.next()).?.value);
            }
            if (bom) inline for (.{ Encoding.utf8, Encoding.utf16le, Encoding.utf16be }) |other| {
                if (other != encoding) try t.expectError(error.XmlEncodingMismatch, xml.prolog.open(bytes, .{ .external_encoding = other }));
            };
        }
    }
}
test "XML generic UTF16 needs BOM while explicit external UTF16LE can supply unlabelled text" {
    inline for (.{ Encoding.utf16le, Encoding.utf16be }) |encoding| {
        const generic = "<?xml version='1.0' encoding='UTF-16'?><x/>";
        const bytes = try encode(generic, encoding, true);
        defer t.allocator.free(bytes);
        _ = try xml.prolog.open(bytes, .{});
        try t.expectError(error.MissingXmlByteOrderMark, xml.prolog.open(bytes[2..], .{}));
        try t.expectError(error.MissingXmlByteOrderMark, xml.prolog.open(bytes[2..], .{ .external_encoding = encoding }));
        const raw = try encode("<?xml version='1.0'?><x/>", encoding, false);
        defer t.allocator.free(raw);
        try t.expectError(error.MissingXmlEncodingDeclaration, xml.prolog.open(raw, .{}));
        _ = try xml.prolog.open(raw, .{ .external_encoding = encoding });
    }
    try t.expectError(error.XmlEncodingMismatch, xml.prolog.open("<?xml version='1.0' encoding='UTF-16'?>", .{}));
    try t.expectError(error.UnsupportedXmlEncoding, xml.prolog.open("<?xml version='1.0' encoding='ISO-8859-1'?>", .{}));
    try t.expectError(error.XmlEncodingMismatch, xml.prolog.open("<?xml version='1.0' encoding='UTF-16LE'?>", .{}));
    for ([_][]const u8{ "\x00\x00\xfe\xff", "\xff\xfe\x00\x00", "\x00\x00\x00<", "\x4c\x6f\xa7\x94" }) |bytes| try t.expectError(error.UnsupportedXmlEncoding, xml.prolog.open(bytes, .{}));
}
test "XML prolog charges signature bytes but not characters and retains global input budget" {
    const declaration = "<?xml version='1.0'?>";
    const bytes = "\xef\xbb\xbf" ++ declaration ++ "x";
    var result = try xml.prolog.open(bytes, .{ .input = .{ .max_bytes = bytes.len, .max_characters = declaration.len + 1 }, .max_declaration_bytes = declaration.len });
    try t.expectEqual(@as(usize, 1), result.input.remaining);
    try t.expectEqual(@as(usize, 3), result.bom_bytes);
    try t.expectEqual(@as(u21, 'x'), (try result.input.next()).?.value);
    try t.expectEqual(null, try result.input.next());
    try t.expectError(error.LimitExceeded, xml.prolog.open(bytes, .{ .input = .{ .max_bytes = bytes.len - 1 } }));
    try t.expectError(error.LimitExceeded, xml.prolog.open(bytes, .{ .max_declaration_bytes = declaration.len - 1 }));
    try t.expectError(error.LimitExceeded, xml.prolog.open(bytes, .{ .input = .{ .max_characters = declaration.len - 1 } }));
    var short = try xml.prolog.open(bytes, .{ .input = .{ .max_characters = declaration.len } });
    try t.expectError(error.LimitExceeded, short.input.next());
    var repeated = try xml.prolog.open("\xef\xbb\xbf\xef\xbb\xbf", .{});
    try t.expectEqual(@as(u21, 0xfeff), (try repeated.input.next()).?.value);
    var body = try xml.prolog.open(declaration ++ "\x00", .{});
    try t.expectError(error.InvalidXmlCharacter, body.input.next());
}

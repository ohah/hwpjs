const std = @import("std");
const subject = @import("xstring.zig");
test "HWPX Xstring content encoder preserves literals CR controls and Unicode under allocation failures" {
    const source = "한글😀<&_x0008_\x00\x08\r\n\t";
    const expected = "한글😀<&_x005F_x0008__x0000__x0008__x000D_\n\t";
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, original: []const u8, encoded_expected: []const u8) !void {
            const encoded = try subject.encodeContent(a, original, 1000);
            defer a.free(encoded);
            try std.testing.expectEqualStrings(encoded_expected, encoded);
            var decoded = try subject.decode(a, encoded, 1000);
            defer decoded.deinit(a);
            try std.testing.expectEqualStrings(original, decoded.text.?);
        }
    }.run, .{ @as([]const u8, source), @as([]const u8, expected) });
}
test "HWPX Xstring content encoder rejects malformed UTF8 and exact output overflow" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "\xc0\x80", "\xed\xa0\x80", "\xf4\x90\x80\x80", "\xff" }) |invalid| try std.testing.expectError(error.InvalidUtf8, subject.encodeContent(a, invalid, 100));
    try std.testing.expectError(error.LimitExceeded, subject.encodeContent(a, "\r", 6));
    const exact = try subject.encodeContent(a, "\r", 7);
    defer a.free(exact);
    try std.testing.expectEqualStrings("_x000D_", exact);
    const empty = try subject.encodeContent(a, "", 0);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
}
test "HWPX Xstring content encoder roundtrips every Unicode scalar" {
    const a = std.testing.allocator;
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    for (0..0x110000) |codepoint| {
        if (codepoint >= 0xd800 and codepoint <= 0xdfff) continue;
        var buffer: [4]u8 = undefined;
        const length = try std.unicode.utf8Encode(@intCast(codepoint), &buffer);
        try source.appendSlice(a, buffer[0..length]);
    }
    const encoded = try subject.encodeContent(a, source.items, 8 * 1024 * 1024);
    defer a.free(encoded);
    var decoded = try subject.decode(a, encoded, 8 * 1024 * 1024);
    defer decoded.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), decoded.unsupported_surrogates);
    try std.testing.expectEqualSlices(u8, source.items, decoded.text.?);
}

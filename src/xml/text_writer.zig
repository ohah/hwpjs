//! Serialize model UTF-8 as XML CharData, not as an attribute or CDATA body.
const std = @import("std");
const scalars = @import("scalars.zig");
const characters = @import("characters.zig");

pub fn encode(a: std.mem.Allocator, text: []const u8, max_bytes: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var offset: usize = 0;
    while (try scalars.read(text, offset, .utf8)) |scalar| {
        if (!characters.valid(scalar.value)) return error.InvalidXmlCharacter;
        const bytes = switch (scalar.value) {
            '&' => "&amp;",
            '<' => "&lt;",
            '>' => "&gt;",
            // Preserve CR through XML end-of-line normalization on reload.
            '\r' => "&#13;",
            else => text[offset..scalar.end],
        };
        if (bytes.len > max_bytes -| out.items.len) return error.LimitExceeded;
        try out.appendSlice(a, bytes);
        offset = scalar.end;
    }
    return out.toOwnedSlice(a);
}

test "XML text writer preserves Unicode CR and escapes markup without entity injection" {
    const a = std.testing.allocator;
    const text = "한😀<&amp;>]]>\r\n\t\"'";
    const output = try encode(a, text, 1000);
    defer a.free(output);
    try std.testing.expectEqualStrings("한😀&lt;&amp;amp;&gt;]]&gt;&#13;\n\t\"'", output);
    const view = @import("text_content.zig").View{ .kind = .char_data, .raw = output, .encoding = .utf8, .scalars = 0, .reference_options = .{} };
    const decoded = try view.toUtf8(a, 1000);
    defer a.free(decoded);
    try std.testing.expectEqualStrings(text, decoded);
    try std.testing.expectError(error.InvalidXmlCharacter, encode(a, &.{0}, 100));
    try std.testing.expectError(error.LimitExceeded, encode(a, "&", 4));
    const empty = try encode(a, "", 0);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
}

test "XML text writer releases output at every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const output = try encode(a, "한😀<&>\r", 1000);
            defer a.free(output);
        }
    }.run, .{});
}

test "XML text writer roundtrips every permitted scalar and rejects malformed UTF-8" {
    const a = std.testing.allocator;
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    for (0..0x110000) |value| {
        if (!characters.valid(@intCast(value))) continue;
        var encoded: [4]u8 = undefined;
        const length = try std.unicode.utf8Encode(@intCast(value), &encoded);
        try text.appendSlice(a, encoded[0..length]);
    }
    const output = try encode(a, text.items, 8 * 1024 * 1024);
    defer a.free(output);
    const view = @import("text_content.zig").View{ .kind = .char_data, .raw = output, .encoding = .utf8, .scalars = 0, .reference_options = .{} };
    const decoded = try view.toUtf8(a, 8 * 1024 * 1024);
    defer a.free(decoded);
    try std.testing.expectEqualSlices(u8, text.items, decoded);
    for ([_][]const u8{ &.{0x80}, &.{ 0xc0, 0x80 }, &.{ 0xed, 0xa0, 0x80 }, &.{ 0xf4, 0x90, 0x80, 0x80 } }) |invalid| {
        try std.testing.expectError(error.InvalidXmlEncoding, encode(a, invalid, 100));
    }
    try std.testing.expectError(error.UnexpectedEnd, encode(a, &.{ 0xf0, 0x9f, 0x98 }, 100));
    for ([_][]const u8{ &.{1}, &.{ 0xef, 0xbf, 0xbe }, &.{ 0xef, 0xbf, 0xbf } }) |invalid| {
        try std.testing.expectError(error.InvalidXmlCharacter, encode(a, invalid, 100));
    }
}

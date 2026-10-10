//! UTF-8 attribute value encoding; preserves whitespace through normalization.
const std = @import("std");

/// Encodes content only, for an enclosing double-quoted attribute.
pub fn encode(a: std.mem.Allocator, text: []const u8, max_bytes: usize) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var offset: usize = 0;
    while (try @import("scalars.zig").read(text, offset, .utf8)) |scalar| {
        if (!@import("characters.zig").valid(scalar.value)) return error.InvalidXmlCharacter;
        const bytes = switch (scalar.value) {
            '&' => "&amp;",
            '<' => "&lt;",
            '"' => "&quot;",
            '\r' => "&#13;",
            '\n' => "&#10;",
            '\t' => "&#9;",
            else => text[offset..scalar.end],
        };
        if (bytes.len > max_bytes -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, bytes);
        offset = scalar.end;
    }
    return output.toOwnedSlice(a);
}

test "XML attribute writer escapes quotes and preserves normalized whitespace" {
    const a = std.testing.allocator;
    const input = "urn:한😀&\"<'\r\n\t";
    const output = try encode(a, input, 1000);
    defer a.free(output);
    try std.testing.expectEqualStrings("urn:한😀&amp;&quot;&lt;'&#13;&#10;&#9;", output);
    const quoted = try std.fmt.allocPrint(a, "\"{s}\"", .{output});
    defer a.free(quoted);
    const value: @import("attribute_value.zig").Value = .{ .raw = quoted, .text = .{ .raw = quoted[1 .. quoted.len - 1], .encoding = .utf8 }, .stats = .{}, .reference_options = .{} };
    const decoded = try value.toUtf8(a, 1000);
    defer a.free(decoded);
    try std.testing.expectEqualStrings(input, decoded);
    try std.testing.expectError(error.InvalidXmlCharacter, encode(a, &.{0}, 100));
    try std.testing.expectError(error.LimitExceeded, encode(a, "&", 4));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const result = try encode(allocator, "namespace😀&\"\t", 1000);
            defer allocator.free(result);
        }
    }.run, .{});
}

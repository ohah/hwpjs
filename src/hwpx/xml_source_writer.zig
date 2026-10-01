//! Assemble validated source-bound edits. This is not a text-site selector:
//! callers must supply whole CharData/CDATA-container spans from the XML tree.
const std = @import("std");
const text_writer = @import("../xml/text_writer.zig");
pub const Change = struct { start: usize, end: usize, text: []const u8, expand_empty_element: bool = false };

/// UTF-8 XML source only. Sorted, nonoverlapping spans are replaced with XML
/// CharData; everything outside those spans is copied byte-for-byte.
pub fn write(a: std.mem.Allocator, source: []const u8, changes: []const Change, max_bytes: usize) ![]u8 {
    var previous: usize = 0;
    for (changes, 0..) |change, index| {
        if (change.start > change.end or change.end > source.len or change.start < previous) return error.InvalidSourceSpan;
        if (index != 0 and change.start == changes[index - 1].start) return error.DuplicateSourceSpan;
        previous = change.end;
    }
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var cursor: usize = 0;
    for (changes) |change| {
        try append(a, &output, source[cursor..change.start], max_bytes);
        var tag: ?@import("../xml/tags.zig").Tag = null;
        defer if (tag) |*value| value.deinit(a);
        if (change.expand_empty_element) {
            const raw = source[change.start..change.end];
            var input = try @import("../xml/input.zig").Input.init(raw, .utf8, .{ .max_bytes = raw.len, .max_characters = raw.len });
            tag = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = raw.len });
            if (tag.?.kind != .empty or input.offset != raw.len) return error.InvalidSourceSpan;
            try append(a, &output, raw[0 .. raw.len - 2], max_bytes);
            try append(a, &output, ">", max_bytes);
        }
        const encoded = try text_writer.encode(a, change.text, max_bytes -| output.items.len);
        defer a.free(encoded);
        try append(a, &output, encoded, max_bytes);
        if (tag) |value| {
            try append(a, &output, "</", max_bytes);
            try append(a, &output, value.name.raw, max_bytes);
            try append(a, &output, ">", max_bytes);
        }
        cursor = change.end;
    }
    try append(a, &output, source[cursor..], max_bytes);
    return output.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), bytes: []const u8, max_bytes: usize) !void {
    if (bytes.len > max_bytes -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, bytes);
}

test "HWPX XML source writer preserves opaque markup outside text sites" {
    const a = std.testing.allocator;
    const source = "<t attr='opaque'>A<!--keep--><![CDATA[B]]></t>";
    const cdata = std.mem.indexOf(u8, source, "<![CDATA[").?;
    const cdata_end = std.mem.indexOf(u8, source, "]]>").? + 3;
    const text_at = std.mem.indexOf(u8, source, ">A").? + 1;
    const output = try write(a, source, &.{ .{ .start = text_at, .end = text_at + 1, .text = "한😀<&" }, .{ .start = cdata, .end = cdata_end, .text = "]]>\r" } }, 1000);
    defer a.free(output);
    try std.testing.expectEqualStrings("<t attr='opaque'>한😀&lt;&amp;<!--keep-->]]&gt;&#13;</t>", output);
    try std.testing.expectError(error.InvalidSourceSpan, write(a, source, &.{.{ .start = 10, .end = 9, .text = "" }}, 1000));
    try std.testing.expectError(error.InvalidSourceSpan, write(a, source, &.{ .{ .start = 1, .end = 5, .text = "" }, .{ .start = 3, .end = 6, .text = "" } }, 1000));
    try std.testing.expectError(error.LimitExceeded, write(a, source, &.{}, source.len - 1));
}

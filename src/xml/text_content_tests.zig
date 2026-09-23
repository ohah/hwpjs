const std = @import("std");
const xml = @import("root.zig");

const Context = struct {
    allocator: std.mem.Allocator,
    expected: []const []const u8,
    index: usize = 0,
    max_bytes: usize = 1024,

    fn onTag(_: *anyopaque, _: xml.tags.Tag, _: *const xml.namespaces.State, _: usize) anyerror!void {}

    fn onContent(raw: *anyopaque, value: xml.text_content.View, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        try std.testing.expectEqual(@as(usize, 1), depth);
        try std.testing.expect(self.index < self.expected.len);
        const decoded = try value.toUtf8(self.allocator, self.max_bytes);
        defer self.allocator.free(decoded);
        try std.testing.expectEqualStrings(self.expected[self.index], decoded);
        try std.testing.expectEqual(std.unicode.utf8CountCodepoints(decoded) catch unreachable, value.scalars);
        self.index += 1;
    }
};

fn visit(a: std.mem.Allocator, source: []const u8, expected: []const []const u8) !void {
    var context: Context = .{ .allocator = a, .expected = expected };
    _ = try xml.document.visit(a, source, .{}, .{ .context = &context, .on_tag = Context.onTag, .on_content = Context.onContent });
    try std.testing.expectEqual(expected.len, context.index);
}

test "XML content visitor decodes references, CDATA and CRLF without changing their semantics" {
    const source = "<r>A&amp;&#13;\r\n<![CDATA[&amp;\r\n]]><![CDATA[]]></r>";
    try visit(std.testing.allocator, source, &.{ "A&\r\n", "&amp;\n", "" });
}

test "XML content visitor exposes exact UTF16 CDATA spans" {
    const ascii = "<r><![CDATA[]]]>X&amp;</r>";
    inline for (.{ xml.input.Encoding.utf16le, xml.input.Encoding.utf16be }) |encoding| {
        var bytes: [2 + ascii.len * 2]u8 = undefined;
        if (encoding == .utf16le) {
            bytes[0] = 0xff;
            bytes[1] = 0xfe;
        } else {
            bytes[0] = 0xfe;
            bytes[1] = 0xff;
        }
        for (ascii, 0..) |c, i| std.mem.writeInt(u16, bytes[2 + i * 2 ..][0..2], c, if (encoding == .utf16le) .little else .big);
        try visit(std.testing.allocator, &bytes, &.{ "]", "X&" });
    }
}

test "XML content visitor enforces decoded UTF8 byte limits and frees allocations" {
    const source = "<r>&#x1F600;</r>";
    var context: Context = .{ .allocator = std.testing.allocator, .expected = &.{"😀"}, .max_bytes = 4 };
    _ = try xml.document.visit(std.testing.allocator, source, .{}, .{ .context = &context, .on_tag = Context.onTag, .on_content = Context.onContent });
    try std.testing.expectEqual(@as(usize, 1), context.index);
    context.max_bytes = 3;
    context.index = 0;
    try std.testing.expectError(error.LimitExceeded, xml.document.visit(std.testing.allocator, source, .{}, .{ .context = &context, .on_tag = Context.onTag, .on_content = Context.onContent }));
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            try visit(a, bytes, &.{"😀"});
        }
    }.run, .{source});
}

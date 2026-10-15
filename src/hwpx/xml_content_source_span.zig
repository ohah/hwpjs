//! One CharData/whole-CDATA source binding shared by text editing callers.
const std = @import("std");
pub fn read(tree: *const @import("xml_part_tree.zig").Tree, value: @import("../xml/text_content.zig").View) !@import("xml_part_tree.zig").Span {
    if (value.encoding != .utf8) return error.UnsupportedEditEncoding;
    const base = @intFromPtr(tree.source.ptr);
    const ptr = @intFromPtr(value.raw.ptr);
    if (ptr < base or ptr - base > tree.source.len) return error.InvalidSourceSpan;
    var start = ptr - base;
    if (value.raw.len > tree.source.len - start) return error.InvalidSourceSpan;
    var end = start + value.raw.len;
    if (value.kind == .cdata) {
        if (start < 9 or tree.source.len - end < 3) return error.InvalidSourceSpan;
        if (!std.mem.eql(u8, tree.source[start - 9 .. start], "<![CDATA[") or !std.mem.eql(u8, tree.source[end..][0..3], "]]>")) return error.InvalidSourceSpan;
        start -= 9;
        end += 3;
    }
    return .{ .start = start, .end = end };
}

test "XML content source span validates complete CDATA and borrowed bounds" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><x><![CDATA[A]]></x></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const start = std.mem.indexOf(u8, tree.source, "<![CDATA[").?;
    var value: @import("../xml/text_content.zig").View = .{ .kind = .cdata, .raw = tree.source[start + 9 .. start + 10], .encoding = .utf8, .scalars = 1, .reference_options = .{} };
    const span = try read(&tree, value);
    try std.testing.expectEqualStrings("<![CDATA[A]]>", tree.source[span.start..span.end]);
    value.raw = tree.source[0..1];
    try std.testing.expectError(error.InvalidSourceSpan, read(&tree, value));
    value.kind = .char_data;
    value.raw = "outside buffer";
    try std.testing.expectError(error.InvalidSourceSpan, read(&tree, value));
    value.encoding = .utf16le;
    try std.testing.expectError(error.UnsupportedEditEncoding, read(&tree, value));
}

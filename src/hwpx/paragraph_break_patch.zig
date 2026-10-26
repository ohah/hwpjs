//! Patch a selected source paragraph break attribute without changing siblings.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
pub fn keepLines(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, value: bool, limit: usize) ![]u8 {
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(head, "paraPr")) return error.InvalidParagraphDisplayElement;
    _ = try @import("paragraph_break_settings.zig").read(a, tree, paragraph);
    const node = try @import("paragraph_display_children.zig").child(a, tree, paragraph, head, "breakSetting") orelse return error.MissingParagraphBreakSetting;
    const raw = (try tree.attributeValue(a, node, "", "keepLines")) orelse return error.MissingParagraphBreakSetting;
    const replacement = [_]u8{ raw.raw[0], if (value) '1' else '0', raw.raw[0] };
    const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = start, .end = start + raw.raw.len, .text = "", .serialized_xml = &replacement }}, limit);
}
test "paragraph keepLines patch preserves all other source bytes and allocation failure atomicity" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:paraPr id='9'><h:breakSetting keepLines = '&#49;' keepWithNext='true' f:keepLines='opaque'/><f:future value='keep&amp;me'/></h:paraPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try keepLines(allocator, source, 1, false, 4096);
            defer allocator.free(output);
            const expected = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:paraPr id='9'><h:breakSetting keepLines = '0' keepWithNext='true' f:keepLines='opaque'/><f:future value='keep&amp;me'/></h:paraPr></h:head>";
            try std.testing.expectEqualStrings(expected, output);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, keepLines(a, &tree, 1, false, 1));
    try std.testing.expectError(error.InvalidParagraphDisplayElement, keepLines(a, &tree, 999, false, 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "paragraph keepLines patch refuses absent foreign and ambiguous settings" {
    const a = std.testing.allocator;
    const cases = [_]struct { xml: []const u8, err: anyerror }{
        .{ .xml = "<h:paraPr/>", .err = error.MissingParagraphBreakSetting },
        .{ .xml = "<h:paraPr><h:breakSetting f:keepLines='1'/></h:paraPr>", .err = error.MissingParagraphBreakSetting },
        .{ .xml = "<h:paraPr><h:breakSetting keepLines='1'/><h:breakSetting keepLines='0'/></h:paraPr>", .err = error.DuplicateParagraphDisplayChild },
        .{ .xml = "<h:paraPr><h:breakSetting keepLines='2'/></h:paraPr>", .err = error.InvalidXmlBoolean },
    };
    for (cases) |item| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'>{s}</h:head>", .{item.xml});
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(item.err, keepLines(a, &tree, 1, false, 4096));
        try std.testing.expectEqualStrings(input, tree.source);
    }
}

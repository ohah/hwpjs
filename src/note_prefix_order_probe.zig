const std = @import("std");
const trees = @import("hwpx/xml_part_tree.zig");
const uri = @import("hwpx/document_xml.zig").paragraph_uri;

test "retained note prefix never aliases an earlier source object" {
    const a = std.testing.allocator;
    const before = [_][]const u8{ "", "<p:tbl/>", "<p:pic/>", "<p:equation/>", "<p:rect/>", "<p:container/>", "<p:ole/>", "<p:line/>" };
    for (before, 0..) |prefix, index| {
        const source = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:footNote><p:subList><p:p><p:run>{s}<p:ctrl><p:autoNum num='1' numType='FOOTNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl><p:t>note</p:t></p:run></p:p></p:subList></p:footNote></p:ctrl></p:run></p:p></s:sec>", .{prefix});
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var checked: usize = 0;
        for (tree.elements, 0..) |element, node| {
            if (!element.is(uri, "autoNum")) continue;
            const control = element.parent.?;
            const paragraph = tree.elements[tree.elements[control].parent.?].parent.?;
            var text_start: ?usize = null;
            for (tree.elements) |text| if (text.is(uri, "t") and tree.elements[text.parent.?].parent == paragraph) {
                text_start = text.start_tag.end;
            };
            try std.testing.expectEqual(index == 0, @import("hwpx/retained_note_number.zig").supported(&tree, control, paragraph, text_start.?));
            try std.testing.expectEqualStrings(source, tree.source);
            _ = node;
            checked += 1;
        }
        try std.testing.expectEqual(@as(usize, 1), checked);
    }
}

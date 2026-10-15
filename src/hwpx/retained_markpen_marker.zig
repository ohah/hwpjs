//! Zero-width source annotations. Retention does not evaluate highlight effects.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const element = tree.elements[index];
    if (!element.is(uri, "markpenBegin") and !element.is(uri, "markpenEnd")) return false;
    if (element.first_child != null) return false;
    if (element.end_tag) |end| if (end.start != element.start_tag.end) return false;
    return true;
}
pub fn onlyChildren(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    var child = tree.elements[index].first_child;
    if (child == null) return false;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!supported(tree, node)) return false;
    }
    return true;
}
test "retained markpen leaf excludes foreign namespace nested and nonempty payload" {
    const std = @import("std");
    const a = std.testing.allocator;
    const variants = [_][]const u8{ "<p:markpenBegin color='#FFFF00'/>", "<p:markpenEnd></p:markpenEnd>", "<x:markpenBegin/>", "<p:markpenBegin><p:t/></p:markpenBegin>", "<p:markpenEnd>hidden</p:markpenEnd>" };
    for (variants, 0..) |fragment, variant| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:p><p:run><p:t>", fragment, "</p:t></p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(variant < 2, supported(&tree, 4));
        try std.testing.expectEqual(variant < 2, onlyChildren(&tree, 3));
        try std.testing.expect(!supported(&tree, tree.elements.len));
    }
}

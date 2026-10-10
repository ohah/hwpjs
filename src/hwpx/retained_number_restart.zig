//! Immutable numbering restart setting; never generates or edits a number.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub fn settingSupported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const setting = tree.elements[index];
    return setting.is(uri, "newNum") and setting.first_child == null and @import("element_whitespace_gaps.zig").empty(tree, index);
}
pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const control = tree.elements[index];
    if (!control.is(uri, "ctrl") or !@import("element_whitespace_gaps.zig").empty(tree, index)) return false;
    const child = control.first_child orelse return false;
    return tree.elements[child].next_sibling == null and settingSupported(tree, child);
}

test "HWPX numbering restart metadata rejects hidden content and mixed wrappers" {
    const std = @import("std");
    const a = std.testing.allocator;
    inline for (.{ "<p:newNum num='-1' numType='PAGE'/>", "<p:newNum/><p:pageNum/>", "<p:newNum>hidden</p:newNum>", "<p:newNum><p:t>hidden</p:t></p:newNum>", "<x:newNum xmlns:x='urn:other'/>" }, .{ true, false, false, false, false }) |body, expected| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl>" ++ body ++ "</p:ctrl></p:run></p:p></s:sec>";
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(expected, supported(&tree, 3));
        try std.testing.expect(!supported(&tree, tree.elements.len));
    }
}

//! Header character resource topology shared by read-only projections.
const Tree = @import("xml_part_tree.zig").Tree;
pub fn contains(tree: *const Tree, node: usize) bool {
    if (tree.part_kind != .header or node >= tree.elements.len) return false;
    const uri = @import("document_xml.zig").head_uri;
    const element = tree.elements[node];
    if (!element.is(uri, "charPr")) return false;
    const group = element.parent orelse return false;
    if (!tree.elements[group].is(uri, "charProperties")) return false;
    const refs = tree.elements[group].parent orelse return false;
    if (!tree.elements[refs].is(uri, "refList")) return false;
    const head = tree.elements[refs].parent orelse return false;
    return head == 0 and tree.elements[head].is(uri, "head");
}

test "HWPX character owner excludes foreign detached nested and section resources" {
    const std = @import("std");
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr/><h:refList><h:charProperties><h:charPr/><f:charPr/><h:extra><h:charPr/></h:extra></h:charProperties></h:refList><h:extra><h:refList><h:charProperties><h:charPr/></h:charProperties></h:refList></h:extra></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |_, index| if (contains(&tree, index)) {
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expect(!contains(&tree, tree.elements.len));
    tree.part_kind = .section;
    for (tree.elements, 0..) |_, index| try std.testing.expect(!contains(&tree, index));
    try std.testing.expectEqualStrings(source, tree.source);
}

//! Structural source envelope only. Does not close a field or grant editing permission.
const Tree = @import("xml_part_tree.zig").Tree;
const document_xml = @import("document_xml.zig");
const uri = document_xml.paragraph_uri;
pub const Envelope = struct {
    owner: ?usize,
    start: usize,
    end: usize,
    pub fn contains(self: Envelope, source_offset: usize) bool {
        return source_offset >= self.start and source_offset < self.end;
    }
};
pub fn forBegin(tree: *const Tree, begin: usize) !Envelope {
    if (tree.part_kind != .section or begin >= tree.elements.len or !tree.elements[begin].is(uri, "fieldBegin")) return error.SourceBindingMismatch;
    const element = tree.elements[begin];
    if (element.start_tag.start >= element.end or element.end > tree.source.len) return error.SourceBindingMismatch;
    var current = element.parent;
    var steps: usize = 0;
    while (current) |node| {
        if (node >= tree.elements.len or steps >= tree.elements.len) return error.SourceBindingMismatch;
        steps += 1;
        const parent = tree.elements[node];
        if (parent.start_tag.start > element.start_tag.start or parent.end < element.end or parent.end > tree.source.len) return error.SourceBindingMismatch;
        if (parent.is(uri, "subList")) return .{ .owner = node, .start = element.start_tag.start, .end = parent.end };
        if (parent.parent == null) {
            if (node != 0 or !parent.is(document_xml.section_uri, "sec")) return error.SourceBindingMismatch;
            return .{ .owner = null, .start = element.start_tag.start, .end = parent.end };
        }
        current = parent.parent;
    }
    return error.SourceBindingMismatch;
}

test "field source envelope separates cells but keeps section and foreign-list starts bounded" {
    const std = @import("std");
    const a = std.testing.allocator;
    const ns = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
    var tree = try @import("xml_part_tree.zig").parse(a, ns ++ "<p:p><p:run><p:t>before</p:t></p:run></p:p><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl><p:t>inside</p:t></p:run></p:p><p:p><p:run><p:t>continuation</p:t></p:run></p:p></p:subList><p:subList><p:p><p:run><p:t>sibling</p:t></p:run></p:p></p:subList><p:p><p:run><p:t>after</p:t></p:run></p:p><x:subList><p:p><p:run><p:ctrl><p:fieldBegin id='2'/></p:ctrl><p:t>root tail</p:t></p:run></p:p></x:subList></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var begins: [2]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |node, index| if (node.is(uri, "fieldBegin")) {
        begins[count] = index;
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
    const nested = try forBegin(&tree, begins[0]);
    try std.testing.expect(nested.owner != null);
    try std.testing.expect(nested.contains(std.mem.indexOf(u8, tree.source, "inside").?));
    try std.testing.expect(nested.contains(std.mem.indexOf(u8, tree.source, "continuation").?));
    try std.testing.expect(!nested.contains(std.mem.indexOf(u8, tree.source, "before").?));
    try std.testing.expect(!nested.contains(std.mem.indexOf(u8, tree.source, "sibling").?));
    try std.testing.expect(!nested.contains(std.mem.indexOf(u8, tree.source, "after").?));
    try std.testing.expect(!nested.contains(nested.end));
    const root = try forBegin(&tree, begins[1]);
    try std.testing.expect(root.owner == null);
    try std.testing.expect(root.contains(std.mem.indexOf(u8, tree.source, "root tail").?));
    try std.testing.expectError(error.SourceBindingMismatch, forBegin(&tree, tree.elements.len));
    try std.testing.expectError(error.SourceBindingMismatch, forBegin(&tree, 0));
    const parent = tree.elements[begins[0]].parent;
    tree.elements[begins[0]].parent = begins[0];
    try std.testing.expectError(error.SourceBindingMismatch, forBegin(&tree, begins[0]));
    tree.elements[begins[0]].parent = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, forBegin(&tree, begins[0]));
    tree.elements[begins[0]].parent = parent;
    const owner_end = tree.elements[nested.owner.?].end;
    tree.elements[nested.owner.?].end = tree.source.len + 1;
    try std.testing.expectError(error.SourceBindingMismatch, forBegin(&tree, begins[0]));
    tree.elements[nested.owner.?].end = owner_end;
}

test "field source envelope chooses the nearest nested text list not its outer owner" {
    const std = @import("std");
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:run><p:rect><p:drawText><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl><p:t>inner</p:t></p:run></p:p></p:subList></p:drawText></p:rect><p:t>outer tail</p:t></p:run></p:p></p:subList></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const begin = for (tree.elements, 0..) |node, index| {
        if (node.is(uri, "fieldBegin")) break index;
    } else return error.MissingFieldBegin;
    const envelope = try forBegin(&tree, begin);
    try std.testing.expect(envelope.contains(std.mem.indexOf(u8, xml, "inner").?));
    try std.testing.expect(!envelope.contains(std.mem.indexOf(u8, xml, "outer tail").?));
    try std.testing.expect(envelope.owner != null);
}

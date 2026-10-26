//! Allocation-free source traversal, excluding separately owned paragraph trees.
const tree_mod = @import("xml_part_tree.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Iterator = struct {
    tree: *const tree_mod.Tree,
    owner: usize,
    cursor: ?usize,
    expected_parent: usize,
    visited: usize = 0,

    pub fn init(tree: *const tree_mod.Tree, owner: usize) !Iterator {
        if (owner >= tree.elements.len or !tree.elements[owner].is(uri, "p")) return error.InvalidTextSites;
        return .{ .tree = tree, .owner = owner, .cursor = tree.elements[owner].first_child, .expected_parent = owner };
    }

    pub fn next(self: *Iterator) !?usize {
        while (self.cursor) |index| {
            if (index >= self.tree.elements.len or self.visited >= self.tree.elements.len) return error.SourceBindingMismatch;
            const element = self.tree.elements[index];
            if (element.parent != self.expected_parent or index == self.owner) return error.SourceBindingMismatch;
            self.visited += 1;
            const nested = element.is(uri, "p");
            if (!nested and element.first_child != null) {
                self.cursor = element.first_child;
                self.expected_parent = index;
            } else {
                var current = index;
                var climbed: usize = 0;
                while (true) {
                    if (current >= self.tree.elements.len or climbed >= self.tree.elements.len) return error.SourceBindingMismatch;
                    climbed += 1;
                    const node = self.tree.elements[current];
                    const parent = node.parent orelse return error.SourceBindingMismatch;
                    if (node.next_sibling) |sibling| {
                        self.cursor = sibling;
                        self.expected_parent = parent;
                        break;
                    }
                    if (parent == self.owner) {
                        self.cursor = null;
                        break;
                    }
                    current = parent;
                }
            }
            if (!nested) return index;
        }
        return null;
    }
};

test "paragraph owned iterator excludes nested paragraphs and preserves foreign wrappers" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try tree_mod.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl><p:tbl><p:p><p:run><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl></p:run></p:p></p:tbl><x:p><p:fieldBegin type='FORMULA'/><x:fieldBegin/></x:p></p:run></p:p><p:p><p:run><p:fieldBegin/></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var iterator = try Iterator.init(&tree, 1);
    var fields: usize = 0;
    while (try iterator.next()) |index| {
        try std.testing.expect(!tree.elements[index].is(uri, "p"));
        if (tree.elements[index].is(uri, "fieldBegin")) fields += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), fields);
    try std.testing.expect(iterator.visited < tree.elements.len - 1);
    try std.testing.expectError(error.InvalidTextSites, Iterator.init(&tree, tree.elements.len));
    try std.testing.expectError(error.InvalidTextSites, Iterator.init(&tree, 0));
}

test "paragraph owned iterator refuses corrupt children sibling cycles and ownership" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try tree_mod.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>text</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var iterator = try Iterator.init(&tree, 1);
    const old_parent = tree.elements[2].parent;
    tree.elements[2].parent = 0;
    try std.testing.expectError(error.SourceBindingMismatch, iterator.next());
    tree.elements[2].parent = old_parent;
    tree.elements[1].first_child = tree.elements.len;
    iterator = try Iterator.init(&tree, 1);
    try std.testing.expectError(error.SourceBindingMismatch, iterator.next());
    tree.elements[1].first_child = 2;
    tree.elements[2].next_sibling = 2;
    iterator = try Iterator.init(&tree, 1);
    var failed = false;
    for (0..tree.elements.len + 1) |_| {
        _ = iterator.next() catch |err| {
            try std.testing.expectEqual(error.SourceBindingMismatch, err);
            failed = true;
            break;
        };
    }
    try std.testing.expect(failed);
}

//! Indexed child elements may be opaque; unindexed source must be XML whitespace.
const std = @import("std");
const trees = @import("xml_part_tree.zig");

pub fn empty(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const element = tree.elements[index];
    var start = element.start_tag.end;
    var child = element.first_child;
    while (child) |child_index| {
        const nested = tree.elements[child_index];
        if (std.mem.trim(u8, tree.source[start..nested.start_tag.start], " \t\r\n").len != 0) return false;
        start = nested.end;
        child = nested.next_sibling;
    }
    return std.mem.trim(u8, tree.source[start..if (element.end_tag) |end| end.start else element.end], " \t\r\n").len == 0;
}

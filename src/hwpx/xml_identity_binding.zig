//! Matches caller-selected immutable XML identities across changed text offsets.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Map = std.AutoHashMapUnmanaged(usize, usize);

fn owner(tree: *const Tree, node: usize, comptime identity: fn (*const Tree, usize) bool) ?usize {
    var cursor = tree.elements[node].parent;
    while (cursor) |at| {
        if (identity(tree, at)) return at;
        cursor = tree.elements[at].parent;
    }
    return null;
}

pub fn bind(a: std.mem.Allocator, source: *const Tree, current: *const Tree, comptime identity: fn (*const Tree, usize) bool) !Map {
    var mapping: Map = .empty;
    errdefer mapping.deinit(a);
    var cursor: usize = 0;
    for (source.elements, 0..) |element, node| {
        if (!identity(source, node)) continue;
        while (cursor < current.elements.len and !identity(current, cursor)) cursor += 1;
        if (cursor == current.elements.len) return error.SourceBindingMismatch;
        const target = current.elements[cursor];
        if (!std.mem.eql(u8, source.source[element.start_tag.start..element.start_tag.end], current.source[target.start_tag.start..target.start_tag.end])) return error.SourceBindingMismatch;
        const parent = if (owner(source, node, identity)) |original| mapping.get(original) orelse return error.SourceBindingMismatch else null;
        if (parent != owner(current, cursor, identity)) return error.SourceBindingMismatch;
        try mapping.put(a, node, cursor);
        cursor += 1;
    }
    while (cursor < current.elements.len) : (cursor += 1) if (identity(current, cursor)) return error.SourceBindingMismatch;
    return mapping;
}

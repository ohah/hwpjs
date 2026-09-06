const std = @import("std");
const body = @import("reader.zig");
const Tree = @import("tree.zig").Tree;
const Reader = @import("../../binary/reader.zig").Reader;
const identity = @import("control_identity.zig");
pub const Link = struct { paragraph_node: usize, text_node: usize, control_node: usize, start_unit: usize, code: u16, id: u32, header_id: u32, identity: identity.Identity = .exact };
/// Owns only the links. Node indices refer to the unchanged source Tree.
pub const Links = struct {
    items: []Link,
    pub fn observedCount(self: Links) usize {
        var count: usize = 0;
        for (self.items) |link| if (link.identity != .exact) {
            count += 1;
        };
        return count;
    }
    pub fn deinit(self: *Links, a: std.mem.Allocator) void {
        a.free(self.items);
        self.* = undefined;
    }
    pub fn build(a: std.mem.Allocator, tree: Tree) !Links {
        var out: std.ArrayList(Link) = .empty;
        errdefer out.deinit(a);
        for (tree.nodes, 0..) |node, index| {
            if (node.record.value == .text) {
                const parent = node.parent orelse return error.OrphanParagraphRecord;
                if (tree.nodes[parent].record.value != .header) return error.OrphanParagraphRecord;
            }
            if (node.record.value == .control_header) {
                const parent = node.parent orelse return error.OrphanControlHeader;
                if (tree.nodes[parent].record.value != .header) return error.OrphanControlHeader;
            }
            if (node.record.value != .header) continue;
            const contents = try @import("paragraph_children.zig").collect(tree, index);
            const text_index = contents.text_node;
            var tokens: body.text.Iterator = if (text_index) |i| tree.nodes[i].record.value.text.tokens() else try body.text.Iterator.init(&.{});
            var child = index + 1;
            while (child < node.subtree_end) {
                const entry = tree.nodes[child];
                if (entry.record.value == .control_header) {
                    const token = (try nextExtended(&tokens)) orelse return error.MissingControlToken;
                    // First four bytes of serialized extended data are a wire ID,
                    // never an address to dereference. Remaining bytes stay opaque.
                    var r: Reader = .{ .bytes = token.value.control.data };
                    const id = try r.readInt(u32);
                    const h = entry.record.value.control_header;
                    const relation = try identity.resolve(id, h.id, token.value.control.code, h.properties);
                    try out.append(a, .{ .paragraph_node = index, .text_node = text_index.?, .control_node = child, .start_unit = token.start_unit, .code = token.value.control.code, .id = id, .header_id = h.id, .identity = relation });
                }
                child = entry.subtree_end;
            }
            if (try nextExtended(&tokens) != null) return error.MissingControlHeader;
        }
        return .{ .items = try out.toOwnedSlice(a) };
    }
};
fn nextExtended(tokens: *body.text.Iterator) !?body.text.Token {
    while (try tokens.next()) |token| {
        if (token.value == .control and token.value.control.kind == .extended) return token;
    }
    return null;
}

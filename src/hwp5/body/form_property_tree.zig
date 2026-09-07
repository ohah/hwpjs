const std = @import("std");
const token = @import("form_property.zig");
pub const Options = struct { max_input_bytes: usize = 64 * 1024 * 1024, max_nodes: usize = 100_000, max_depth: usize = 64 };
pub const Node = struct { parent: ?usize, subtree_end: usize, property: token.Property };
const Frame = struct { iterator: token.Iterator, owner: ?usize, base: usize };
/// Owns only the node array. All property slices borrow the original input.
pub const Tree = struct {
    nodes: []Node,
    pub fn deinit(self: *Tree, a: std.mem.Allocator) void {
        a.free(self.nodes);
        self.* = undefined;
    }
    pub fn parseObservedUnits(a: std.mem.Allocator, bytes: []const u8, options: Options) !Tree {
        if (bytes.len > options.max_input_bytes) return error.FormPropertyInputLimit;
        const root = try token.Iterator.initObservedUnits(bytes);
        var nodes: std.ArrayList(Node) = .empty;
        errdefer nodes.deinit(a);
        var frames: std.ArrayList(Frame) = .empty;
        defer frames.deinit(a);
        try frames.append(a, .{ .iterator = root, .owner = null, .base = 0 });
        while (frames.items.len != 0) {
            const frame = &frames.items[frames.items.len - 1];
            const p = (try frame.iterator.next()) orelse {
                if (frame.owner) |owner| nodes.items[owner].subtree_end = nodes.items.len;
                _ = frames.pop();
                continue;
            };
            if (nodes.items.len >= options.max_nodes) return error.FormPropertyNodeLimit;
            if (p.kind == .set and frames.items.len > options.max_depth) return error.FormPropertyDepthLimit;
            const parent = frame.owner;
            var property = p;
            // Both offsets address subranges within the original bounded input.
            property.offset += frame.base;
            property.value_offset += frame.base;
            const index = nodes.items.len;
            try nodes.append(a, .{ .parent = parent, .subtree_end = index + 1, .property = property });
            if (p.kind == .set) try frames.append(a, .{ .iterator = try token.Iterator.initObservedUnits(p.value), .owner = index, .base = property.value_offset });
        }
        return .{ .nodes = try nodes.toOwnedSlice(a) };
    }
};

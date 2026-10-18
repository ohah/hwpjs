//! Request-local table-list inventory from the authoritative sibling iterator.
const std = @import("std");
const Tree = @import("tree.zig").Tree;
const lists = @import("table_lists.zig");

pub const Entry = struct { control_node: usize, table_node: usize, kind: lists.Kind };
pub const Index = struct {
    tree: Tree,
    entries: std.AutoHashMapUnmanaged(usize, Entry) = .empty,
    loaded: std.AutoHashMapUnmanaged(usize, void) = .empty,

    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.entries.deinit(a);
        self.loaded.deinit(a);
        self.* = undefined;
    }

    /// Requires the unchanged borrowed tree. Unrequested owners stay uninspected.
    pub fn get(self: *Index, a: std.mem.Allocator, owner: usize, list: usize) !Entry {
        if (!self.loaded.contains(owner)) {
            var iterator = try lists.Iterator.init(self.tree, owner);
            while (iterator.next()) |entry| {
                try self.entries.put(a, entry.node, .{ .control_node = owner, .table_node = iterator.table_node, .kind = entry.kind });
            }
            try self.loaded.put(a, owner, {});
        }
        const entry = self.entries.get(list) orelse return error.InvalidTableOwner;
        if (entry.control_node != owner) return error.InvalidTableOwner;
        return entry;
    }
};

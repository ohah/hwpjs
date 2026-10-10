//! Query-local immutable cell metadata reuse; never caches current edits.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const owner = @import("table_display_owner.zig");
const fields = @import("table_xml_fields.zig");

pub const Query = struct {
    allocator: std.mem.Allocator,
    tree: *const Tree,
    cells: std.AutoHashMapUnmanaged(usize, owner.Owner) = .empty,

    pub fn deinit(self: *Query) void {
        self.cells.deinit(self.allocator);
        self.* = undefined;
    }

    pub fn resolve(self: *Query, template: usize) !?owner.Owner {
        if (template >= self.tree.elements.len or !fields.childIs(self.tree, template, "p")) return error.InvalidCellParagraphTemplate;
        const list = self.tree.elements[template].parent orelse return null;
        if (!fields.childIs(self.tree, list, "subList")) return null;
        if (self.cells.get(list)) |cached| return cached;
        const resolved = try owner.resolve(self.allocator, self.tree, template);
        if (resolved) |value| try self.cells.put(self.allocator, list, value);
        return resolved;
    }
};

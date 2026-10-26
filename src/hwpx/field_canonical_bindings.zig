//! Request-owned canonical source bindings; never a current-text or permission cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Key = struct { element: usize, start: usize };

pub fn pieceOfSite(row: *const Paragraph, site: usize) !usize {
    if (site >= row.sites.items.len) return error.SourceBindingMismatch;
    if (row.joined()) |joined| {
        try joined.validate();
        var found: ?usize = null;
        for (joined.pieces, 0..) |piece, index| {
            if (site < piece.first_site or site - piece.first_site >= piece.site_count) continue;
            if (piece.output != .current_runs or piece.template_only or found != null) return error.SourceBindingMismatch;
            found = index;
        }
        return found orelse error.SourceBindingMismatch;
    }
    return 0;
}

pub const Inventory = struct {
    tree: *const Tree,
    original: Sites.Sites,
    indices: std.AutoHashMapUnmanaged(Key, usize),
    owner_counts: std.AutoHashMapUnmanaged(usize, usize),

    pub fn init(a: std.mem.Allocator, tree: *const Tree, options: Sites.Options) !Inventory {
        var original = try Sites.collect(a, tree, options);
        errdefer original.deinit(a);
        var indices: std.AutoHashMapUnmanaged(Key, usize) = .empty;
        errdefer indices.deinit(a);
        var counts: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        errdefer counts.deinit(a);
        for (original.items, 0..) |site, index| {
            const entry = try indices.getOrPut(a, .{ .element = site.element_index, .start = site.start });
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = index;
            const owner = try @import("paragraph_site_owner.zig").ancestor(tree, site.element_index);
            const count = try counts.getOrPut(a, owner);
            if (!count.found_existing) count.value_ptr.* = 0;
            count.value_ptr.* = std.math.add(usize, count.value_ptr.*, 1) catch return error.LimitExceeded;
        }
        return .{ .tree = tree, .original = original, .indices = indices, .owner_counts = counts };
    }

    pub fn deinit(self: *Inventory, a: std.mem.Allocator) void {
        self.owner_counts.deinit(a);
        self.indices.deinit(a);
        self.original.deinit(a);
        self.* = undefined;
    }

    /// Same writer binding/flag proof and complete per-owner cardinality as selector.
    /// Current strings may differ; source offsets/flags and owning piece may not.
    pub fn validateRow(self: *const Inventory, a: std.mem.Allocator, row: *const Paragraph) !void {
        var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer seen.deinit(a);
        for (row.sites.items, 0..) |site, index| {
            const piece = try pieceOfSite(row, index);
            const owner = if (row.pieces) |pieces| pieces[piece].template_element else row.template_element;
            if (try @import("paragraph_site_owner.zig").ancestor(self.tree, site.element_index) != owner) return error.SourceBindingMismatch;
            const original_index = self.indices.get(.{ .element = site.element_index, .start = site.start }) orelse return error.UnsupportedStructuralFieldEdit;
            _ = try @import("text_sites_save.zig").siteChange(self.tree, self.original.items[original_index], site);
            const entry = try seen.getOrPut(a, original_index);
            if (entry.found_existing) return error.SourceBindingMismatch;
        }
        var expected: usize = 0;
        if (row.pieces) |pieces| {
            for (pieces) |piece| {
                if (piece.output != .current_runs or piece.template_only) continue;
                expected = std.math.add(usize, expected, self.owner_counts.get(piece.template_element) orelse 0) catch return error.LimitExceeded;
            }
        } else expected = self.owner_counts.get(row.template_element) orelse 0;
        if (seen.count() != expected) return error.SourceBindingMismatch;
    }
};

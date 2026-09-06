const std = @import("std");
const Tree = @import("tree.zig").Tree;
pub const Group = struct {
    pub const Memo = struct { node: usize, header: @import("memo_list_header.zig").Header };
    header_node: usize,
    parent_node: usize,
    begin: usize,
    end: usize,
    paragraph_count: usize = 0,
    intervening_records: usize = 0,
    memo: ?Memo = null,
};
/// Linear cursor over Groups.build output. Owners must be visited in node order.
pub const OwnerCursor = struct {
    groups: []const Group,
    index: usize = 0,
    pub fn take(self: *OwnerCursor, parent: usize) []const Group {
        while (self.index < self.groups.len and self.groups[self.index].parent_node < parent) self.index += 1;
        const start = self.index;
        while (self.index < self.groups.len and self.groups[self.index].parent_node == parent) self.index += 1;
        return self.groups[start..self.index];
    }
};
/// Logical sibling groups, not a replacement for the original record tree.
/// Owns groups only; indices require the unchanged source tree.
/// Items are ordered by parent node, then by sibling header order.
pub const Groups = struct {
    items: []Group,
    pub fn deinit(self: *Groups, a: std.mem.Allocator) void {
        a.free(self.items);
        self.* = undefined;
    }
    pub fn build(a: std.mem.Allocator, tree: Tree) !Groups {
        var out: std.ArrayList(Group) = .empty;
        errdefer out.deinit(a);
        for (tree.nodes, 0..) |node, parent| {
            if (node.record.value == .list_header and node.parent == null) return error.OrphanListHeader;
            var current: ?usize = null;
            var child = parent + 1;
            var previous: ?usize = null;
            while (child < node.subtree_end) {
                const entry = tree.nodes[child];
                switch (entry.record.value) {
                    .list_header => {
                        if (current) |i| {
                            out.items[i].end = child;
                            try validate(tree, out.items[i]);
                        }
                        current = out.items.len;
                        const memo: ?Group.Memo = if (previous) |p| if (tree.nodes[p].record.value == .memo_list)
                            .{ .node = p, .header = try @import("memo_list_header.zig").Header.parse(entry.record.value.list_header) }
                        else
                            null else null;
                        try out.append(a, .{ .header_node = child, .parent_node = parent, .begin = entry.subtree_end, .end = node.subtree_end, .memo = memo });
                    },
                    .header => {
                        const i = current orelse return error.OrphanListParagraph;
                        out.items[i].paragraph_count += 1;
                    },
                    else => {
                        if (current) |i| out.items[i].intervening_records += 1;
                    },
                }
                previous = child;
                child = entry.subtree_end;
            }
            if (current) |i| try validate(tree, out.items[i]);
        }
        return .{ .items = try out.toOwnedSlice(a) };
    }
};
fn validate(tree: Tree, group: Group) !void {
    if (group.memo) |memo| {
        if (memo.header.paragraph_count < 0) return error.NegativeMemoParagraphCount;
        if (@as(u32, @intCast(memo.header.paragraph_count)) != group.paragraph_count) return error.ListParagraphCountMismatch;
        return;
    }
    // Observed unsigned 16-bit declaration. The header still exposes signedCount
    // separately for spec consumers; no 6/8-byte attribute-layout guess is made.
    if (tree.nodes[group.header_node].record.value.list_header.count_raw != group.paragraph_count) return error.ListParagraphCountMismatch;
}

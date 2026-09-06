const std = @import("std");
const Tree = @import("tree.zig").Tree;
const Group = @import("list_groups.zig").Group;
const absent = std.math.maxInt(usize);
/// Root paragraphs share scope 0; other scopes are their LIST_HEADER node index.
/// Keys are section-local and refer to the unchanged source Tree, not document IDs.
pub const Flows = struct {
    owners: []usize,
    pub fn deinit(self: *Flows, a: std.mem.Allocator) void {
        a.free(self.owners);
        self.* = undefined;
    }
    pub fn get(self: Flows, paragraph: usize) !usize {
        if (paragraph >= self.owners.len or self.owners[paragraph] == absent) return error.InvalidParagraphNode;
        return self.owners[paragraph];
    }
    /// Reuses Groups built from this Tree; does not decode list payloads or counts.
    pub fn build(a: std.mem.Allocator, tree: Tree, groups: []const Group) !Flows {
        const owners = try a.alloc(usize, tree.nodes.len);
        errdefer a.free(owners);
        @memset(owners, absent);
        for (tree.nodes, 0..) |node, i| {
            if (node.record.value == .header and node.parent == null) owners[i] = 0;
        }
        for (groups) |g| {
            if (g.header_node == 0 or g.header_node >= tree.nodes.len or g.parent_node >= tree.nodes.len or g.begin > g.end or g.end > tree.nodes.len) return error.InvalidFlowGroup;
            const header = tree.nodes[g.header_node];
            if (header.record.value != .list_header or header.parent != g.parent_node or g.begin != header.subtree_end or g.end > tree.nodes[g.parent_node].subtree_end) return error.InvalidFlowGroup;
            var i = g.begin;
            while (i < g.end) {
                const node = tree.nodes[i];
                if (node.parent != g.parent_node or node.subtree_end > g.end) return error.InvalidFlowGroup;
                if (node.record.value == .header) {
                    if (owners[i] != absent) return error.DuplicateParagraphFlow;
                    owners[i] = g.header_node;
                }
                i = node.subtree_end;
            }
        }
        for (tree.nodes, 0..) |node, i| {
            if (node.record.value == .header and owners[i] == absent) return error.MissingParagraphFlow;
        }
        return .{ .owners = owners };
    }
};

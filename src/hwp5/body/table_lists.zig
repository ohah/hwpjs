const Tree = @import("tree.zig").Tree;
const table_id = @import("control_rules.zig").table_id;
pub const Kind = enum { caption, cell };
pub const Entry = struct { node: usize, kind: Kind };
/// Direct siblings before TABLE are captions; after TABLE are cells.
/// Unknown intervening records and nested tables do not change this boundary.
pub const Iterator = struct {
    tree: Tree,
    table_node: usize,
    cursor: usize,
    end: usize,
    pub fn init(tree: Tree, owner: usize) !Iterator {
        if (owner >= tree.nodes.len) return error.InvalidTableOwner;
        const n = tree.nodes[owner];
        if (n.record.value != .control_header or n.record.value.control_header.id != table_id) return error.InvalidTableOwner;
        var marker: ?usize = null;
        var i = owner + 1;
        while (i < n.subtree_end) {
            if (tree.nodes[i].record.value == .table) {
                if (marker != null) return error.DuplicateTableRecord;
                marker = i;
            }
            i = tree.nodes[i].subtree_end;
        }
        return .{ .tree = tree, .table_node = marker orelse return error.MissingTableRecord, .cursor = owner + 1, .end = n.subtree_end };
    }
    pub fn next(self: *Iterator) ?Entry {
        while (self.cursor < self.end) {
            const i = self.cursor;
            self.cursor = self.tree.nodes[i].subtree_end;
            if (self.tree.nodes[i].record.value == .list_header) return .{ .node = i, .kind = if (i < self.table_node) .caption else .cell };
        }
        return null;
    }
};

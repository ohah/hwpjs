const Tree = @import("tree.zig").Tree;
/// Return a single direct child. Never borrow a sibling's or descendant's record.
pub fn find(tree: Tree, parent: usize, tag: u10) error{DuplicateChildRecord}!?usize {
    var result: ?usize = null;
    var child = parent + 1;
    while (child < tree.nodes[parent].subtree_end) : (child = tree.nodes[child].subtree_end) {
        if (tree.nodes[child].record.framing.tag != tag) continue;
        if (result != null) return error.DuplicateChildRecord;
        result = child;
    }
    return result;
}

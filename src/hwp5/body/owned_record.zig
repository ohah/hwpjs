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
/// Check one component/payload relationship, sharing direct ownership across shape validators.
pub fn componentChild(tree: Tree, index: usize, owner_id: u32, tag: u10) !?usize {
    const component = @import("shape_component.zig");
    const node = tree.nodes[index];
    if (node.record.framing.tag == tag) {
        const parent = node.parent orelse return error.OrphanChildRecord;
        const owner = tree.nodes[parent].record.framing;
        if (owner.tag != component.tag or try component.identity(owner.payload) != owner_id) return error.OrphanChildRecord;
    }
    if (node.record.framing.tag != component.tag or try component.identity(node.record.framing.payload) != owner_id) return null;
    return (try find(tree, index, tag)) orelse error.MissingChildRecord;
}

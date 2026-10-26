const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;

/// Exact direct chartSpace/chart owner shared by chart-level source readers.
pub fn find(tree: *const Tree, ambiguous: anyerror) !?usize {
    if (tree.elements.len == 0) return null;
    var selected: ?usize = null;
    var child = tree.elements[0].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(uri, "chart")) continue;
        if (selected != null) return ambiguous;
        selected = node;
    }
    return selected;
}

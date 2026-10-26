const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
pub fn parent(tree: *const Tree, node: usize) ?usize {
    if (node >= tree.elements.len) return null;
    const area = tree.elements[node].parent orelse return null;
    if (!tree.elements[area].is(uri, "plotArea")) return null;
    const chart = tree.elements[area].parent orelse return null;
    if (!tree.elements[chart].is(uri, "chart") or tree.elements[chart].parent != @as(?usize, 0)) return null;
    return area;
}

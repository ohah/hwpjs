//! Point index keys retained as opaque metadata, not visible paragraph text.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const marker = tree.elements[index];
    if (!marker.is(uri, "indexmark") or !@import("element_whitespace_gaps.zig").empty(tree, index)) return false;
    const control = marker.parent orelse return false;
    const run = tree.elements[control].parent orelse return false;
    const paragraph = tree.elements[run].parent orelse return false;
    if (!tree.elements[control].is(uri, "ctrl") or !tree.elements[run].is(uri, "run") or !tree.elements[paragraph].is(uri, "p")) return false;
    var child = marker.first_child orelse return false;
    if (!tree.elements[child].is(uri, "firstKey") or tree.elements[child].first_child != null) return false;
    child = tree.elements[child].next_sibling orelse return true;
    return tree.elements[child].is(uri, "secondKey") and tree.elements[child].first_child == null and tree.elements[child].next_sibling == null;
}

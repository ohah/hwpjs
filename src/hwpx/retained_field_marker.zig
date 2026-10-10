//! Structural field-control retention only; links/type semantics are separate.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const ctrl = tree.elements[index];
    if (!ctrl.is(uri, "ctrl") or !@import("element_whitespace_gaps.zig").empty(tree, index)) return false;
    const owner = ctrl.parent orelse return false;
    if (!tree.elements[owner].is(uri, "run")) return false;
    const marker = ctrl.first_child orelse return false;
    const node = tree.elements[marker];
    return node.next_sibling == null and (node.is(uri, "fieldBegin") or node.is(uri, "fieldEnd"));
}

//! Immutable point bookmarks. No name resolution, mutation, or display glyph.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
const empty = @import("element_whitespace_gaps.zig").empty;
pub fn settingSupported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const marker = tree.elements[index];
    return marker.is(uri, "bookmark") and marker.first_child == null and empty(tree, index);
}
pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const control = tree.elements[index];
    if (!control.is(uri, "ctrl") or !empty(tree, index)) return false;
    const run = control.parent orelse return false;
    const paragraph = tree.elements[run].parent orelse return false;
    if (!tree.elements[run].is(uri, "run") or !tree.elements[paragraph].is(uri, "p")) return false;
    var child = control.first_child;
    var found = false;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (settingSupported(tree, node)) found = true else if (!@import("retained_page_number.zig").settingSupported(tree, node) and !@import("retained_number_restart.zig").settingSupported(tree, node)) return false;
    }
    return found;
}
pub fn directSupported(tree: *const Tree, index: usize) bool {
    if (!settingSupported(tree, index)) return false;
    const run = tree.elements[index].parent orelse return false;
    const paragraph = tree.elements[run].parent orelse return false;
    return tree.elements[run].is(uri, "run") and tree.elements[paragraph].is(uri, "p");
}

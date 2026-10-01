//! Preserve page-area containers without projecting their paragraphs into the owner.
const trees = @import("xml_part_tree.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supported(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const area = tree.elements[index];
    if ((!area.is(uri, "header") and !area.is(uri, "footer")) or !gaps.empty(tree, index)) return false;
    const list_index = area.first_child orelse return false;
    const list = tree.elements[list_index];
    if (!list.is(uri, "subList") or list.next_sibling != null or !gaps.empty(tree, list_index)) return false;
    var child = list.first_child;
    while (child) |paragraph_index| {
        const paragraph = tree.elements[paragraph_index];
        if (!paragraph.is(uri, "p")) return false;
        child = paragraph.next_sibling;
    }
    return true;
}

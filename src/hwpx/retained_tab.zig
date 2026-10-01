//! Shared eligibility for one-unit preserved inline tabs.
const tree_module = @import("xml_part_tree.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supported(tree: *const tree_module.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const element = tree.elements[index];
    if (!element.is(uri, "tab") or element.first_child != null) return false;
    // The text scanner also emits character data inside a paired inline tag.
    // Do not advertise one unit when that tag contains unowned visible text.
    return if (element.end_tag) |end| element.start_tag.end == end.start else true;
}

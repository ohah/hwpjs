//! Shape permission for retaining an automatic-number source anchor.
//! Attribute decoding remains owned by number_control_fields.zig.
const trees = @import("xml_part_tree.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supported(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const number = tree.elements[index];
    if (!number.is(uri, "autoNum") or !gaps.empty(tree, index)) return false;
    const format_index = number.first_child orelse return true;
    const format = tree.elements[format_index];
    return format.is(uri, "autoNumFormat") and format.next_sibling == null and
        format.first_child == null and gaps.empty(tree, format_index);
}

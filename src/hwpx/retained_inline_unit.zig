//! Immutable one-unit inline elements. Spelling is derived, never serialized.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Kind = enum { tab, nb_space, fw_space, line_break, hypen };
pub fn kind(tree: *const Tree, index: usize) ?Kind {
    if (index >= tree.elements.len) return null;
    const element = tree.elements[index];
    if (element.first_child != null) return null;
    if (element.end_tag) |end| if (end.start != element.start_tag.end) return null;
    if (element.is(uri, "tab")) return .tab;
    if (element.is(uri, "nbSpace")) return .nb_space;
    if (element.is(uri, "fwSpace")) return .fw_space;
    if (element.is(uri, "lineBreak")) return .line_break;
    if (element.is(uri, "hypen")) return .hypen;
    return null;
}
pub fn supported(tree: *const Tree, index: usize) bool {
    return kind(tree, index) != null;
}

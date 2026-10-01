//! Zero-text-position run settings retained verbatim, not rendered inline objects.
const trees = @import("xml_part_tree.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supported(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const control = tree.elements[index];
    if (!control.is(uri, "ctrl") or !gaps.empty(tree, index)) return false;
    var child = control.first_child orelse return false;
    while (true) {
        const setting = tree.elements[child];
        if (!gaps.empty(tree, child)) return false;
        if (setting.is(uri, "pageNum")) {
            if (setting.first_child != null) return false;
        } else if (setting.is(uri, "colPr")) {
            var nested = setting.first_child;
            while (nested) |nested_index| {
                const leaf = tree.elements[nested_index];
                if ((!leaf.is(uri, "colLine") and !leaf.is(uri, "colSz")) or
                    leaf.first_child != null or !gaps.empty(tree, nested_index)) return false;
                nested = leaf.next_sibling;
            }
        } else return false;
        child = setting.next_sibling orelse return true;
    }
}

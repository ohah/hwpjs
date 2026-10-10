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
        if (setting.is(uri, "bookmark")) {
            if (!@import("retained_bookmark.zig").settingSupported(tree, child) or !@import("retained_bookmark.zig").supported(tree, index)) return false;
        } else if (setting.is(uri, "pageNum")) {
            if (!@import("retained_page_number.zig").settingSupported(tree, child)) return false;
        } else if (setting.is(uri, "pageHiding")) {
            if (!@import("retained_page_hiding.zig").settingSupported(tree, child)) return false;
        } else if (setting.is(uri, "newNum")) {
            if (!@import("retained_number_restart.zig").settingSupported(tree, child)) return false;
        } else if (setting.is(uri, "indexmark")) {
            if (!@import("retained_index_mark.zig").supported(tree, child)) return false;
        } else if (setting.is(uri, "colPr")) {
            var nested = setting.first_child;
            while (nested) |nested_index| {
                const leaf = tree.elements[nested_index];
                if ((!leaf.is(uri, "colLine") and !leaf.is(uri, "colSz")) or
                    leaf.first_child != null or !gaps.empty(tree, nested_index)) return false;
                nested = leaf.next_sibling;
            }
        } else if (!@import("retained_header_footer.zig").supported(tree, child)) return false;
        child = setting.next_sibling orelse return true;
    }
}

//! Zero-text-position run settings retained verbatim, not rendered inline objects.
const trees = @import("xml_part_tree.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// A run with only zero-position metadata can own an empty text site.
/// Fields, drawing anchors, existing text and opaque source gaps are excluded.
pub fn runOnly(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const run = tree.elements[index];
    if (!run.is(uri, "run") or !gaps.empty(tree, index)) return false;
    var child = run.first_child orelse return false;
    while (true) {
        if (!runChildSupported(tree, child)) return false;
        child = tree.elements[child].next_sibling orelse return true;
    }
}

/// Shared zero-position run-child rule; never classifies visible/unknown objects as metadata.
pub fn runChildSupported(tree: *const trees.Tree, index: usize) bool {
    return supported(tree, index) or sectionSettingSupported(tree, index);
}

// Only the empty-run fallback uses this rule. Existing ctrl classification
// and unrelated text/anchor policy remain unchanged.
fn sectionSettingSupported(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const setting = tree.elements[index];
    if (!setting.is(uri, "secPr") or !gaps.empty(tree, index)) return false;
    const parent = setting.parent orelse return false;
    return parent < tree.elements.len and tree.elements[parent].is(uri, "run");
}

/// Empty fallback must not precede an object/field-owned insertion boundary.
pub fn paragraphOnly(tree: *const trees.Tree, run_index: usize) bool {
    if (!runOnly(tree, run_index)) return false;
    const parent = tree.elements[run_index].parent orelse return false;
    if (parent >= tree.elements.len or !tree.elements[parent].is(uri, "p")) return false;
    var child = tree.elements[parent].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (!element.is(uri, "linesegarray") and !runOnly(tree, index)) return false;
        child = element.next_sibling;
    }
    return true;
}

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

//! Prove a restart precedes all visible content using the shared retained-metadata policy.
const Tree = @import("xml_part_tree.zig").Tree;
const metadata = @import("retained_run_metadata.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn isLeading(tree: *const Tree, paragraph: usize, control: usize, run: usize) bool {
    if (paragraph >= tree.elements.len or control >= tree.elements.len or run >= tree.elements.len or !gaps.empty(tree, paragraph) or !metadata.supported(tree, control)) return false;
    var child = tree.elements[paragraph].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (index == run) {
            if (!element.is(uri, "run") or !gaps.empty(tree, index)) return false;
            var setting = element.first_child;
            while (setting) |current| : (setting = tree.elements[current].next_sibling) {
                if (current == control) return true;
                if (!metadata.runChildSupported(tree, current)) return false;
            }
            return false;
        }
        if (element.is(uri, "run")) {
            if (!metadata.runOnly(tree, index)) return false;
        } else if (!element.is(uri, "linesegarray")) return false;
    }
    return false;
}

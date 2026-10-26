//! Shared eligibility for one-unit preserved inline tabs.
const tree_module = @import("xml_part_tree.zig");

pub fn supported(tree: *const tree_module.Tree, index: usize) bool {
    return @import("retained_inline_unit.zig").kind(tree, index) == .tab;
}

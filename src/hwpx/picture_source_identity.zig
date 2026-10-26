//! Immutable object owners shared by picture serializers.
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub fn isOwner(tree: *const Tree, node: usize) bool {
    for ([_][]const u8{ "pic", "container", "tbl", "tr", "tc", "subList" }) |name| if (fields.childIs(tree, node, name)) return true;
    return false;
}

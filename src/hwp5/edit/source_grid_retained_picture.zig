//! Borrowed, direct picture ownership proof. No cloning, relocation or mutation.
const Tree = @import("../body/tree.zig").Tree;
const rules = @import("../body/control_rules.zig");
const component = @import("../body/shape_component.zig");
const owned = @import("../body/owned_record.zig");

pub fn validate(tree: Tree, paragraph: usize, control: usize) !void {
    const node = tree.nodes[control];
    if (node.parent != paragraph or node.record.value != .control_header or node.record.value.control_header.id != rules.drawing_id) return error.UnsupportedSourceTableGrid;
    _ = try @import("../body/object_common.zig").parseControl(node.record.value.control_header);
    const shape = (try owned.find(tree, control, component.tag)) orelse return error.UnsupportedSourceTableGrid;
    // A group, sibling picture or extra owned record is not a direct picture.
    if (shape != control + 1 or tree.nodes[shape].subtree_end != node.subtree_end) return error.UnsupportedSourceTableGrid;
    const layout = try @import("../body/shape_validation.zig").componentLayout(tree, shape);
    const value = try component.Component.parse(tree.nodes[shape].record.framing.payload, layout);
    if (value.id != rules.id("$pic") or value.second_id == null or value.second_id.? != value.id) return error.UnsupportedSourceTableGrid;
    const picture = (try owned.componentChild(tree, shape, rules.id("$pic"), 85)) orelse return error.UnsupportedSourceTableGrid;
    if (picture != shape + 1 or tree.nodes[picture].subtree_end != picture + 1 or tree.nodes[picture].subtree_end != tree.nodes[shape].subtree_end) return error.UnsupportedSourceTableGrid;
    // The shared 73-byte base is read only. Later picture fields remain borrowed
    // byte-for-byte; choosing a modern tail layout is unnecessary for preservation.
    _ = try @import("../body/shape_picture.zig").Picture.parse(tree.nodes[picture].record.framing.payload, .interleaved, .base73);
}

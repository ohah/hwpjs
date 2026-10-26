//! Only a directly owned name-only bookmark can become a nonpainting anchor.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, tree: @import("../body/tree.zig").Tree, control: usize) !void {
    if (control >= tree.nodes.len) return error.UnsupportedBookmarkAnchor;
    const node = tree.nodes[control];
    if (node.record.framing.tag != 71 or node.record.framing.payload.len != 4 or std.mem.readInt(u32, node.record.framing.payload[0..4], .little) != @import("../body/control_rules.zig").id("bokm") or node.subtree_end != control + 2) return error.UnsupportedBookmarkAnchor;
    const data = tree.nodes[control + 1];
    if (data.parent != control or data.subtree_end != control + 2) return error.UnsupportedBookmarkAnchor;
    if (try @import("control_data_policy.zig").validateRetainedNode(a, tree, control + 1) != .bookmark_name) return error.UnsupportedBookmarkAnchor;
}

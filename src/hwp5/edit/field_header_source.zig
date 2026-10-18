//! Source header lookup shared by strict bindings and retention consumers.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
const body = @import("../body/reader.zig");
const start = @import("../body/field_start.zig");
pub const Header = struct { source_node: u32, properties: start.Properties };

fn checkOwner(tree: Tree, owner: usize) !void {
    if (owner >= tree.nodes.len or tree.nodes[owner].record.value != .header) return error.SourceBindingMismatch;
}

pub fn count(tree: Tree, owner: usize) !usize {
    try checkOwner(tree, owner);
    var actual: usize = 0;
    var child = owner + 1;
    while (child < tree.nodes[owner].subtree_end) : (child = tree.nodes[child].subtree_end) {
        const node = tree.nodes[child];
        if (node.parent != owner) return error.SourceBindingMismatch;
        if (node.record.framing.tag != @intFromEnum(body.Tag.control_header)) continue;
        if (start.supports((try body.ControlHeader.parse(node.record.framing.payload)).id)) actual += 1;
    }
    return actual;
}

pub fn read(tree: Tree, owner: usize, wanted: usize, id: u32, readable: bool) !Header {
    try checkOwner(tree, owner);
    var ordinal: usize = 0;
    var selected: ?usize = null;
    var child = owner + 1;
    while (child < tree.nodes[owner].subtree_end) : (child = tree.nodes[child].subtree_end) {
        const node = tree.nodes[child];
        if (node.parent != owner) return error.SourceBindingMismatch;
        if (node.record.framing.tag != @intFromEnum(body.Tag.control_header)) continue;
        const header = try body.ControlHeader.parse(node.record.framing.payload);
        if (!start.supports(header.id)) continue;
        if (ordinal == wanted) {
            if (header.id != id) {
                if (!readable) return error.FieldMarkerMismatch;
                _ = @import("../body/control_identity.zig").resolve(id, header.id, 3, header.properties) catch |err| switch (err) {
                    error.ControlIdMismatch => return error.FieldMarkerMismatch,
                    else => return err,
                };
            }
            selected = child;
        }
        ordinal += 1;
    }
    const index = selected orelse return error.SourceBindingMismatch;
    const header = try body.ControlHeader.parse(tree.nodes[index].record.framing.payload);
    return .{ .source_node = std.math.cast(u32, index) orelse return error.LimitExceeded, .properties = try start.Properties.parse(header.properties) };
}

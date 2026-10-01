//! Retained anchors reuse existing wire identity and header pairing validation.
const std = @import("std");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;

pub fn validate(a: std.mem.Allocator, tree: Tree) !void {
    for (tree.nodes) |*node| {
        if (node.record.framing.tag == @intFromEnum(body.Tag.control_header))
            node.record.value = .{ .control_header = try body.ControlHeader.parse(node.record.framing.payload) };
    }
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const report = try @import("../body/control_type_validation.zig").inspect(links.items);
    if (report.deferred != 0) return error.UnsupportedSectionControl;
    for (links.items) |link| {
        if (link.code == 3) _ = try @import("../body/field_start.zig").Properties.parse(tree.nodes[link.control_node].record.value.control_header.properties);
    }
}

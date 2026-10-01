//! Logical list membership reuses the existing sibling-group contract.
//! Does not guess a 6/8-byte cell layout or flatten the source hierarchy.
const std = @import("std");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const Groups = @import("../body/list_groups.zig").Groups;
const controls = @import("../body/control_rules.zig");
const tables = @import("../body/table_lists.zig");
const Version = @import("../version.zig").Version;

pub fn validate(a: std.mem.Allocator, tree: Tree, paragraph: usize, version: Version) !void {
    const parent = tree.nodes[paragraph].parent orelse return;
    // Decode only ownership records. Unrelated shapes remain immutable raw
    // payload, rather than forcing the complete semantic document parser.
    for (tree.nodes) |*node| {
        const record = node.record.framing;
        switch (record.tag) {
            @intFromEnum(body.Tag.control_header) => node.record.value = .{ .control_header = try body.ControlHeader.parse(record.payload) },
            @intFromEnum(body.Tag.list_header) => node.record.value = .{ .list_header = try body.ListHeader.parse(record.payload) },
            @intFromEnum(body.Tag.table) => node.record.value = .{ .table = try body.Table.parse(record.payload, version) },
            else => {},
        }
    }
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    var owner: ?usize = null;
    for (groups.items) |group| {
        if (group.parent_node == parent and paragraph >= group.begin and paragraph < group.end) {
            owner = group.header_node;
            break;
        }
    }
    const list = owner orelse return error.OrphanListParagraph;
    const node = tree.nodes[parent];
    if (node.record.value == .control_header) {
        const id = node.record.value.control_header.id;
        if (id == controls.table_id) {
            var it = try tables.Iterator.init(tree, parent);
            while (it.next()) |entry| if (entry.node == list) return;
            return error.InvalidTableOwner;
        }
        if (id == controls.id("head") or id == controls.id("foot") or id == controls.id("fn  ") or id == controls.id("en  ")) return;
    }
    if (node.record.framing.tag == @import("../body/shape_component.zig").tag) {
        var ancestor = node.parent;
        while (ancestor) |index| {
            const value = tree.nodes[index].record.value;
            if (value == .control_header) {
                if (value.control_header.id == controls.drawing_id) return;
                break;
            }
            ancestor = tree.nodes[index].parent;
        }
    }
    return error.UnsupportedNestedParagraph;
}

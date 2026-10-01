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
    var groups = try inspectGroups(a, tree, version);
    defer groups.deinit(a);
    return validateGroups(tree, groups, paragraph, parent, version);
}

/// Shared decoding/group contract for text eligibility and structure planning.
pub fn inspectGroups(a: std.mem.Allocator, tree: Tree, version: Version) !Groups {
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
    return Groups.build(a, tree);
}

pub fn logicalOwner(tree: Tree, groups: Groups, paragraph: usize) !?usize {
    if (paragraph >= tree.nodes.len or tree.nodes[paragraph].record.value != .header) return error.SourceBindingMismatch;
    const parent = tree.nodes[paragraph].parent orelse return null;
    for (groups.items) |group| {
        if (group.parent_node == parent and paragraph >= group.begin and paragraph < group.end) {
            return group.header_node;
        }
    }
    return error.OrphanListParagraph;
}

fn validateGroups(tree: Tree, groups: Groups, paragraph: usize, parent: usize, version: Version) !void {
    const list = (try logicalOwner(tree, groups, paragraph)) orelse return error.OrphanListParagraph;
    const node = tree.nodes[parent];
    if (node.record.value == .control_header) {
        const id = node.record.value.control_header.id;
        if (id == controls.section_id) {
            const root = node.parent orelse return error.OrphanSectionDefinition;
            if (tree.nodes[root].record.value != .header or tree.nodes[root].parent != null) return error.OrphanSectionDefinition;
            _ = try body.section_def.Definition.parse(node.record.value.control_header.properties, version);
            const view = try tree.nodes[list].record.value.list_header.view(.observed8);
            _ = try @import("../body/master_page.zig").Area.parse(view.extra);
            return;
        }
        if (id == controls.table_id) {
            var it = try tables.Iterator.init(tree, parent);
            while (it.next()) |entry| if (entry.node == list) return;
            return error.InvalidTableOwner;
        }
        if (id == controls.drawing_id) {
            // Direct drawing lists are captions; text boxes live beneath a
            // SHAPE_COMPONENT. Keep these two owners distinct.
            const view = try tree.nodes[list].record.value.list_header.view(.observed8);
            _ = try body.Caption.parse(view.extra);
            return;
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

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
            @backingInt(body.Tag.control_header) => node.record.value = .{ .control_header = try body.ControlHeader.parse(record.payload) },
            @backingInt(body.Tag.list_header) => node.record.value = .{ .list_header = try body.ListHeader.parse(record.payload) },
            @backingInt(body.Tag.memo_list) => node.record.value = .{ .memo_list = try body.memo_list.Header.parse(record.payload) },
            // Ownership inspection preserves the original record. Recognize a
            // wholly absent zone count without accepting a partial count/zone.
            @backingInt(body.Tag.table) => node.record.value = .{ .table = try body.Table.parseWithZoneCountPolicy(record.payload, version, .observed_absent) },
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
    return validateList(tree, groups, parent, list, version, null, null);
}

fn validateList(tree: Tree, groups: Groups, parent: usize, list: usize, version: Version, prepared: ?*@import("../body/table_list_index.zig").Index, allocator: ?std.mem.Allocator) !void {
    const node = tree.nodes[parent];
    if (node.record.value == .header) return @import("paragraph_owned_list.zig").validate(tree, groups, parent, list);
    if (node.record.value == .control_header) {
        const id = node.record.value.control_header.id;
        if (id == controls.section_id) {
            _ = try masterPageArea(tree, parent, list, version);
            return;
        }
        if (id == controls.table_id) {
            if (prepared) |index| {
                _ = try index.get(allocator.?, parent, list);
                return;
            }
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

/// Shared original master-list owner/prefix contract for editing and queries.
pub fn masterPageArea(tree: Tree, owner: usize, list: usize, version: Version) !@import("../body/master_page.zig").Area {
    if (owner >= tree.nodes.len or list >= tree.nodes.len) return error.SourceBindingMismatch;
    const node = tree.nodes[owner];
    if (node.record.value != .control_header or node.record.value.control_header.id != controls.section_id or tree.nodes[list].parent != owner or tree.nodes[list].record.value != .list_header) return error.SourceBindingMismatch;
    const root = node.parent orelse return error.OrphanSectionDefinition;
    if (tree.nodes[root].record.value != .header or tree.nodes[root].parent != null) return error.OrphanSectionDefinition;
    _ = try body.section_def.Definition.parse(node.record.value.control_header.properties, version);
    const view = try tree.nodes[list].record.value.list_header.view(.observed8);
    return @import("../body/master_page.zig").Area.parse(view.extra);
}

/// Request-local ownership inventory. Uses exactly inspectGroups and the same
/// selected-list validator as validate(); never validates unrelated owners.
/// Missing ownership is rejected only when that paragraph/list is requested.
pub const Prepared = struct {
    groups: Groups,
    group_for_node: []usize,
    accepted: []bool,
    tables_index: @import("../body/table_list_index.zig").Index,
    work: if (@import("builtin").is_test) struct { index_steps: usize = 0, selected_lists: usize = 0 } else void = if (@import("builtin").is_test) .{} else {},
    const absent = std.math.maxInt(usize);

    pub fn init(a: std.mem.Allocator, tree: Tree, version: Version) !Prepared {
        var groups = try inspectGroups(a, tree, version);
        errdefer groups.deinit(a);
        const slots = try a.alloc(usize, tree.nodes.len);
        errdefer a.free(slots);
        @memset(slots, absent);
        const accepted = try a.alloc(bool, groups.items.len);
        errdefer a.free(accepted);
        @memset(accepted, false);
        var steps: if (@import("builtin").is_test) usize else void = if (@import("builtin").is_test) tree.nodes.len else {};
        for (groups.items, 0..) |g, index| {
            if (@import("builtin").is_test) steps += 1;
            if (slots[g.header_node] == absent) slots[g.header_node] = index;
            var child = g.begin;
            while (child < g.end) {
                if (@import("builtin").is_test) steps += 1;
                const node = tree.nodes[child];
                if (node.record.value == .header and node.parent == g.parent_node and slots[child] == absent) slots[child] = index;
                child = node.subtree_end;
            }
        }
        return .{ .groups = groups, .group_for_node = slots, .accepted = accepted, .tables_index = .{ .tree = tree }, .work = if (@import("builtin").is_test) .{ .index_steps = steps } else {} };
    }
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.tables_index.deinit(a);
        self.groups.deinit(a);
        a.free(self.group_for_node);
        a.free(self.accepted);
    }
    pub fn logical(self: *const Prepared, tree: Tree, paragraph: usize) !?usize {
        if (paragraph >= tree.nodes.len or tree.nodes[paragraph].record.value != .header) return error.SourceBindingMismatch;
        if (tree.nodes[paragraph].parent == null) return null;
        const index = self.group_for_node[paragraph];
        if (index == absent) return error.OrphanListParagraph;
        return self.groups.items[index].header_node;
    }
    pub fn validate(self: *Prepared, a: std.mem.Allocator, tree: Tree, paragraph: usize, version: Version) !void {
        const parent = tree.nodes[paragraph].parent orelse return;
        const list = (try self.logical(tree, paragraph)) orelse return error.OrphanListParagraph;
        const index = self.group_for_node[list];
        if (self.accepted[index]) return;
        try validateList(tree, .{ .items = self.groups.items[index..][0..1] }, parent, list, version, &self.tables_index, a);
        self.accepted[index] = true;
        if (@import("builtin").is_test) self.work.selected_lists += 1;
    }
    pub fn validateOwned(self: *Prepared, tree: Tree, owner: usize, list: usize) !void {
        const index = self.group_for_node[list];
        if (index == absent) return error.OrphanListHeader;
        try @import("paragraph_owned_list.zig").validate(tree, .{ .items = self.groups.items[index..][0..1] }, owner, list);
    }
};

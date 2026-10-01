//! Derived structural insertion plan; current paragraph values remain SSOT.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Groups = @import("../body/list_groups.zig").Groups;
const Version = @import("../version.zig").Version;
const owners = @import("paragraph_owner.zig");

pub const Insertion = struct {
    paragraph: usize,
    template_node: u32,
    owner_list: ?usize,
    last_in_owner: bool,
};
pub const Plan = struct {
    insertions: []Insertion,
    /// Indexed by immutable source record; only LIST_HEADER nodes are nonzero.
    list_additions: []u16,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.insertions);
        a.free(self.list_additions);
        self.* = undefined;
    }
};

fn ownerOf(tree: Tree, groups: Groups, node: usize) !?usize {
    const parent = tree.nodes[node].parent orelse return null;
    for (groups.items) |group| {
        if (group.parent_node == parent and node >= group.begin and node < group.end) return group.header_node;
    }
    return error.OrphanListParagraph;
}

pub fn build(a: std.mem.Allocator, tree: Tree, section: model.Section, version: Version) !Plan {
    if (section.source_record_count != tree.nodes.len) return error.SourceBindingMismatch;
    var groups = try owners.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const additions = try a.alloc(u16, tree.nodes.len);
    errdefer a.free(additions);
    @memset(additions, 0);
    var insertions: std.ArrayList(Insertion) = .empty;
    errdefer insertions.deinit(a);
    var original_cursor: usize = 0;
    var previous: ?u32 = null;
    for (section.paragraphs, 0..) |p, index| {
        if (p.source_node) |node| {
            _ = try p.originalNode();
            while (original_cursor < tree.nodes.len and tree.nodes[original_cursor].record.value != .header) original_cursor += 1;
            if (node != original_cursor) return error.SourceBindingMismatch;
            original_cursor += 1;
            previous = node;
            continue;
        }
        const template = p.header_template orelse return error.MissingParagraphTemplate;
        if (previous == null or previous.? != template or template >= tree.nodes.len or tree.nodes[template].record.value != .header) return error.SourceBindingMismatch;
        const parent: ?usize = if (p.parent_node) |node| @as(usize, node) else null;
        if (tree.nodes[template].parent != parent) return error.SourceBindingMismatch;
        if (p.instance_id == 0) return error.InvalidParagraphInstanceId;
        for (section.paragraphs, 0..) |other, other_index| {
            if (other_index != index and other.instance_id == p.instance_id) return error.InvalidParagraphInstanceId;
        }
        try owners.validate(a, tree, template, version);
        const owner = try ownerOf(tree, groups, template);
        var last = true;
        for (tree.nodes[template + 1 ..], template + 1..) |node, ni| {
            if (node.record.value == .header and try ownerOf(tree, groups, ni) == owner) {
                last = false;
                break;
            }
        }
        if (index + 1 < section.paragraphs.len and section.paragraphs[index + 1].source_node == null and section.paragraphs[index + 1].header_template == template) last = false;
        if (owner) |list| {
            additions[list] = std.math.add(u16, additions[list], 1) catch return error.LimitExceeded;
            _ = std.math.add(u16, tree.nodes[list].record.value.list_header.count_raw, additions[list]) catch return error.LimitExceeded;
        }
        try insertions.append(a, .{ .paragraph = index, .template_node = template, .owner_list = owner, .last_in_owner = last });
    }
    while (original_cursor < tree.nodes.len) : (original_cursor += 1) if (tree.nodes[original_cursor].record.value == .header) return error.SourceBindingMismatch;
    return .{ .insertions = try insertions.toOwnedSlice(a), .list_additions = additions };
}

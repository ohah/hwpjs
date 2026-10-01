//! Derived structural insertion plan; current paragraph values remain SSOT.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
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
    removals: []u32,
    list_removals: []u16,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.insertions);
        a.free(self.list_additions);
        a.free(self.removals);
        a.free(self.list_removals);
        self.* = undefined;
    }
};

pub fn build(a: std.mem.Allocator, tree: Tree, section: model.Section, version: Version) !Plan {
    return buildWithDeletions(a, tree, section, version, false);
}

/// Deletion plans are opt-in until the writer can remove their raw subtrees.
pub fn buildWithDeletions(a: std.mem.Allocator, tree: Tree, section: model.Section, version: Version, allow_deletions: bool) !Plan {
    if (section.source_record_count != tree.nodes.len) return error.SourceBindingMismatch;
    var groups = try owners.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const additions = try a.alloc(u16, tree.nodes.len);
    errdefer a.free(additions);
    @memset(additions, 0);
    const removed_counts = try a.alloc(u16, tree.nodes.len);
    errdefer a.free(removed_counts);
    @memset(removed_counts, 0);
    var removals: std.ArrayList(u32) = .empty;
    errdefer removals.deinit(a);
    var insertions: std.ArrayList(Insertion) = .empty;
    errdefer insertions.deinit(a);
    var original_cursor: usize = 0;
    var previous: ?u32 = null;
    for (section.paragraphs, 0..) |p, index| {
        if (p.source_node) |node| {
            _ = try p.originalNode();
            if (node >= tree.nodes.len or node < original_cursor or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
            while (original_cursor < node) : (original_cursor += 1) {
                if (tree.nodes[original_cursor].record.value != .header) continue;
                if (!allow_deletions) return error.SourceBindingMismatch;
                try removals.append(a, @intCast(original_cursor));
            }
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
        const owner = try owners.logicalOwner(tree, groups, template);
        var last = true;
        for (tree.nodes[template + 1 ..], template + 1..) |node, ni| {
            if (node.record.value == .header and try owners.logicalOwner(tree, groups, ni) == owner) {
                last = false;
                break;
            }
        }
        if (index + 1 < section.paragraphs.len and section.paragraphs[index + 1].source_node == null and section.paragraphs[index + 1].header_template == template) last = false;
        if (allow_deletions) {
            last = true;
            for (section.paragraphs[index + 1 ..]) |following| {
                const next = following.source_node orelse following.header_template orelse return error.MissingParagraphTemplate;
                if (try owners.logicalOwner(tree, groups, next) == owner) {
                    last = false;
                    break;
                }
            }
        }
        if (owner) |list| {
            additions[list] = std.math.add(u16, additions[list], 1) catch return error.LimitExceeded;
            _ = std.math.add(u16, tree.nodes[list].record.value.list_header.count_raw, additions[list]) catch return error.LimitExceeded;
        }
        try insertions.append(a, .{ .paragraph = index, .template_node = template, .owner_list = owner, .last_in_owner = last });
    }
    while (original_cursor < tree.nodes.len) : (original_cursor += 1) {
        if (tree.nodes[original_cursor].record.value != .header) continue;
        if (!allow_deletions) return error.SourceBindingMismatch;
        try removals.append(a, @intCast(original_cursor));
    }
    for (removals.items) |node| {
        const header = tree.nodes[node];
        if (header.record.value.header.extra.len != 0 or (header.record.value.header.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
        // Do not silently delete containers, controls or unrepresented content.
        for (tree.nodes[node + 1 .. header.subtree_end]) |child| {
            if (child.parent != node) return error.UnsupportedStructuralControl;
            switch (child.record.framing.tag) {
                67 => {
                    const payload = child.record.framing.payload;
                    if (payload.len == 0) {
                        if (header.record.value.header.characterUnits() > 1) return error.UnsupportedMissingText;
                    } else try @import("plain_text_content.zig").validatePlain(payload);
                },
                68, 69 => {},
                70 => if (child.record.framing.payload.len != 0) return error.UnsupportedRangeSemantics,
                else => return error.UnsupportedStructuralControl,
            }
        }
        if (try owners.logicalOwner(tree, groups, node)) |list| {
            removed_counts[list] = std.math.add(u16, removed_counts[list], 1) catch return error.LimitExceeded;
        }
    }
    for (removed_counts, 0..) |count, node| {
        if (count == 0) continue;
        const total = @as(u32, tree.nodes[node].record.value.list_header.count_raw) + additions[node];
        if (count >= total) return error.EmptyParagraphList;
    }
    const owned_insertions = try insertions.toOwnedSlice(a);
    errdefer a.free(owned_insertions);
    return .{ .insertions = owned_insertions, .list_additions = additions, .removals = try removals.toOwnedSlice(a), .list_removals = removed_counts };
}

//! Derived structural insertion plan; current paragraph values remain SSOT.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const owners = @import("paragraph_owner.zig");
const absent = std.math.maxInt(usize);
pub const TestWork = struct {
    source_visits: usize = 0,
    current_visits: usize = 0,
    instance_probes: usize = 0,
    following_probes: usize = 0,
    owner_validations: usize = 0,
    restart_presence_checks: usize = 0,
    restart_checks: usize = 0,
    removal_visits: usize = 0,
};
pub var test_work: if (@import("builtin").is_test) TestWork else void = if (@import("builtin").is_test) .{} else {};

fn logicalOwner(tree: Tree, flows: @import("../body/paragraph_flows.zig").Flows, node: usize) !?usize {
    if (node >= tree.nodes.len or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
    const owner = flows.get(node) catch return error.OrphanListParagraph;
    return if (owner == 0) null else owner;
}

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
    var flows = try @import("../body/paragraph_flows.zig").Flows.build(a, tree, groups.items);
    defer flows.deinit(a);
    // Include original IDs: generated IDs must not collide with either kind.
    var instance_counts: std.AutoHashMapUnmanaged(u32, u2) = .empty;
    defer instance_counts.deinit(a);
    // Borrowed paragraph values, preserving the original declaration order.
    // The common no-restart deletion case must not rescan all current rows for
    // each removed source header. Retained restart validation stays in its SSOT.
    var restart_paragraphs: std.ArrayList(model.Paragraph) = .empty;
    defer restart_paragraphs.deinit(a);
    for (section.paragraphs) |paragraph| {
        if (@import("builtin").is_test) test_work.instance_probes += 1;
        if (@import("builtin").is_test) test_work.restart_presence_checks += 1;
        if (paragraph.restart_control_source != null) try restart_paragraphs.append(a, paragraph);
        const entry = try instance_counts.getOrPut(a, paragraph.instance_id);
        if (!entry.found_existing) entry.value_ptr.* = 1 else entry.value_ptr.* = 2;
    }
    const last_source = try a.alloc(usize, tree.nodes.len + 1);
    defer a.free(last_source);
    @memset(last_source, absent);
    for (tree.nodes, 0..) |node, index| {
        if (@import("builtin").is_test) test_work.source_visits += 1;
        if (node.record.value != .header) continue;
        const owner = try logicalOwner(tree, flows, index);
        last_source[owner orelse tree.nodes.len] = index;
    }
    const last_current = try a.alloc(usize, tree.nodes.len + 1);
    defer a.free(last_current);
    @memset(last_current, absent);
    const next_owner = try a.alloc(usize, section.paragraphs.len);
    defer a.free(next_owner);
    const next_bad = try a.alloc(usize, section.paragraphs.len);
    defer a.free(next_bad);
    const owner_errors = try a.alloc(?anyerror, section.paragraphs.len);
    defer a.free(owner_errors);
    @memset(owner_errors, null);
    // Preserve the old following scan's error priority: an invalid reference is
    // observed only if it occurs before the first later matching owner.
    var bad: usize = absent;
    var reverse = section.paragraphs.len;
    while (reverse > 0) {
        reverse -= 1;
        if (@import("builtin").is_test) test_work.current_visits += 1;
        next_bad[reverse] = bad;
        next_owner[reverse] = absent;
        const paragraph = section.paragraphs[reverse];
        const template = paragraph.source_node orelse paragraph.header_template orelse {
            owner_errors[reverse] = error.MissingParagraphTemplate;
            bad = reverse;
            continue;
        };
        const owner = logicalOwner(tree, flows, template) catch |err| {
            owner_errors[reverse] = err;
            bad = reverse;
            continue;
        };
        const key = owner orelse tree.nodes.len;
        next_owner[reverse] = last_current[key];
        last_current[key] = reverse;
    }
    var validated_templates: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer validated_templates.deinit(a);
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
        if (@import("builtin").is_test) test_work.current_visits += 1;
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
        if (@import("builtin").is_test) test_work.instance_probes += 1;
        if (instance_counts.get(p.instance_id).? != 1) return error.InvalidParagraphInstanceId;
        if (!validated_templates.contains(template)) {
            if (@import("builtin").is_test) test_work.owner_validations += 1;
            try owners.validate(a, tree, template, version);
            try validated_templates.put(a, template, {});
        }
        const owner = try logicalOwner(tree, flows, template);
        if (@import("builtin").is_test) test_work.following_probes += 1;
        var last = last_source[owner orelse tree.nodes.len] == template;
        if (index + 1 < section.paragraphs.len and section.paragraphs[index + 1].source_node == null and section.paragraphs[index + 1].header_template == template) last = false;
        if (allow_deletions) {
            if (next_bad[index] < next_owner[index]) return owner_errors[next_bad[index]].?;
            last = next_owner[index] == absent;
        }
        if (owner) |list| {
            additions[list] = std.math.add(u16, additions[list], 1) catch return error.LimitExceeded;
            _ = try (try @import("paragraph_list_count.zig").read(tree, list)).adjusted(additions[list], 0);
        }
        try insertions.append(a, .{ .paragraph = index, .template_node = template, .owner_list = owner, .last_in_owner = last });
    }
    while (original_cursor < tree.nodes.len) : (original_cursor += 1) {
        if (tree.nodes[original_cursor].record.value != .header) continue;
        if (!allow_deletions) return error.SourceBindingMismatch;
        try removals.append(a, @intCast(original_cursor));
    }
    for (removals.items) |node| {
        if (@import("builtin").is_test) test_work.removal_visits += 1;
        const header = tree.nodes[node];
        if (header.record.value.header.extra.len != 0 or (header.record.value.header.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
        var retained_restart = false;
        for (restart_paragraphs.items) |p| {
            if (@import("builtin").is_test) test_work.restart_checks += 1;
            var links = try @import("../body/control_links.zig").Links.build(a, tree);
            defer links.deinit(a);
            const index = (try @import("page_restart_source.zig").forParagraph(links.items, p)).?;
            if (links.items[index].paragraph_node != node) continue;
            _ = try @import("current_restart_anchor.zig").resolve(a, tree, links.items, index, section.paragraphs);
            retained_restart = true;
        }
        // Do not silently delete containers, controls or unrepresented content.
        for (tree.nodes[node + 1 .. header.subtree_end]) |child| {
            if (retained_restart) continue; // Exact leaf scope was checked by resolver.
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
        if (try logicalOwner(tree, flows, node)) |list| {
            removed_counts[list] = std.math.add(u16, removed_counts[list], 1) catch return error.LimitExceeded;
        }
    }
    for (removed_counts, 0..) |count, node| {
        if (count == 0) continue;
        const total = try (try @import("paragraph_list_count.zig").read(tree, node)).adjusted(additions[node], 0);
        if (count >= total) return error.EmptyParagraphList;
    }
    const owned_insertions = try insertions.toOwnedSlice(a);
    errdefer a.free(owned_insertions);
    return .{ .insertions = owned_insertions, .list_additions = additions, .removals = try removals.toOwnedSlice(a), .list_removals = removed_counts };
}

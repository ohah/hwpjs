//! Physical-order owner refs. One tree/links/digest/current-owner pass per section.
//! Selected-owner History.validate remains the mutation authority on commit.
const std = @import("std");
const model = @import("../../model/document.zig");
const H = @import("page_restart_history.zig");
const rules = @import("../body/control_rules.zig");
pub const Candidate = struct { control: usize, number: ?u16 = null, observation: ?H.Observation = null, reason: ?[]const u8 = null };
const Owner = struct { paragraph: ?usize = null, bad: bool = false };
const Owners = std.AutoHashMapUnmanaged(usize, Owner);
fn mark(a: std.mem.Allocator, owners: *Owners, node: usize) !void {
    const entry = try owners.getOrPut(a, node);
    if (!entry.found_existing) entry.value_ptr.* = .{};
    entry.value_ptr.bad = true;
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const model.Paragraph, section: usize, ticket: @import("../../model/history_mutation_epoch.zig").Ticket, revision: u32, read_only: bool) ![]Candidate {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners: Owners = .empty;
    defer owners.deinit(a);
    var bad_controls: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer bad_controls.deinit(a);
    for (paragraphs, 0..) |paragraph, index| {
        if (paragraph.source_node) |node| {
            const entry = try owners.getOrPut(a, node);
            if (!entry.found_existing) entry.value_ptr.* = .{ .paragraph = index } else entry.value_ptr.bad = true;
            if (paragraph.header_template != null or paragraph.restart_control_source != null or paragraph.parent_node != null) entry.value_ptr.bad = true;
        }
        if (paragraph.header_template) |node| try mark(a, &owners, node);
        if (paragraph.restart_control_source) |node| try bad_controls.put(a, node, {});
    }
    var counts: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer counts.deinit(a);
    for (links.items) |link| {
        const entry = try counts.getOrPut(a, link.paragraph_node);
        if (!entry.found_existing) entry.value_ptr.* = 0;
        entry.value_ptr.* += 1;
    }
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    var out: std.ArrayList(Candidate) = .empty;
    errdefer out.deinit(a);
    for (links.items) |link| {
        if (link.header_id != rules.id("nwno")) continue;
        const value = try @import("../body/number_control.zig").Restart.parse(tree.nodes[link.control_node].record.value.control_header.properties);
        if (value.header.kind() != 0) continue;
        if (out.items.len >= 20000) return error.LimitExceeded;
        var row: Candidate = .{ .control = link.control_node, .number = value.header.number };
        const observed: ?H.Observation = admitted: {
            if (read_only) {
                row.reason = "PageRestartReadOnly";
                break :admitted null;
            }
            const parent = tree.nodes[link.paragraph_node];
            const control = tree.nodes[link.control_node];
            const owner = owners.get(link.paragraph_node) orelse {
                row.reason = "MissingPageRestartOwner";
                break :admitted null;
            };
            if (parent.parent != null or owner.bad or owner.paragraph == null or bad_controls.contains(link.control_node)) {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            }
            if (link.code != 21 or link.id != link.header_id or link.identity != .exact or counts.get(link.paragraph_node).? != 1 or control.parent != link.paragraph_node or control.subtree_end != link.control_node + 1 or value.header.attributes != 0 or value.header.number == 0 or value.extra.len != 0) {
                row.reason = "UnsupportedRestartSplit";
                break :admitted null;
            }
            const header = parent.record.value.header;
            if (header.extra.len != 0 or (header.merge_tracking orelse 0) != 0) {
                row.reason = "UnsupportedParagraphExtension";
                break :admitted null;
            }
            var child = link.paragraph_node + 1;
            while (child < parent.subtree_end) : (child += 1) {
                const entry = tree.nodes[child];
                if (entry.parent != link.paragraph_node or entry.subtree_end != child + 1) {
                    row.reason = "UnsupportedRestartSplit";
                    break :admitted null;
                }
                switch (entry.record.framing.tag) {
                    67, 68, 69 => {},
                    70 => if (entry.record.framing.payload.len != 0) {
                        row.reason = "UnsupportedRangeSemantics";
                        break :admitted null;
                    },
                    71 => if (child != link.control_node) {
                        row.reason = "UnsupportedRestartSplit";
                        break :admitted null;
                    },
                    else => {
                        row.reason = "UnsupportedRestartSplit";
                        break :admitted null;
                    },
                }
            }
            // One admitted control per paragraph, so this token scan is linear overall.
            var unit: ?u32 = null;
            for (paragraphs[owner.paragraph.?].tokens) |token| {
                if (token.kind != .control or token.raw.len != 16 or std.mem.readInt(u16, token.raw[0..2], .little) != link.code or std.mem.readInt(u32, token.raw[2..6], .little) != link.id) continue;
                if (unit != null) {
                    row.reason = "AmbiguousPageRestartOwner";
                    break :admitted null;
                }
                unit = token.start_unit;
            }
            if (unit == null) {
                row.reason = "MissingCurrentControlAnchor";
                break :admitted null;
            }
            break :admitted .{ .target = .{ .section = section, .control_node = link.control_node, .paragraph_node = link.paragraph_node, .source_unit = link.start_unit, .number = value.header.number, .section_digest = digest }, .anchor = .{ .paragraph = owner.paragraph.?, .current_unit = unit.? }, .ticket = ticket, .revision = revision };
        };
        row.observation = observed;
        try out.append(a, row);
    }
    return out.toOwnedSlice(a);
}

const std = @import("std");
const ranges = @import("memo_ranges.zig");
const Start = struct { node: usize, index: ?u32, matched: bool = false };
/// Document-owned events; starts are temporary for one section's field pass.
pub const Collection = struct {
    events: std.ArrayList(ranges.Event) = .empty,
    starts: std.ArrayList(Start) = .empty,
    pub fn deinit(self: *Collection, a: std.mem.Allocator) void {
        self.events.deinit(a);
        self.starts.deinit(a);
        self.* = undefined;
    }
    pub fn addStart(self: *Collection, a: std.mem.Allocator, node: usize, index: ?u32) !void {
        // field_validation visits Tree nodes in original order.
        if (self.starts.items.len > 0 and self.starts.items[self.starts.items.len - 1].node >= node) return error.InvalidMemoStartOrder;
        try self.starts.append(a, .{ .node = node, .index = index });
    }
    pub fn addEnd(self: *Collection, a: std.mem.Allocator, section: usize, paragraph: usize, unit: usize, index: u32) !void {
        try self.events.append(a, .{ .section = section, .scope = 0, .paragraph = paragraph, .unit = unit, .value = .{ .end = index } });
    }
    /// Reuses links and groups from the same Tree. No field or text reparsing.
    pub fn resolveSection(self: *Collection, a: std.mem.Allocator, section: usize, begin: usize, tree: @import("tree.zig").Tree, groups: []const @import("list_groups.zig").Group, links: []const @import("control_links.zig").Link) !void {
        if (begin > self.events.items.len) return error.InvalidMemoEventBoundary;
        if (self.starts.items.len == 0 and begin == self.events.items.len) return;
        var flows = try @import("paragraph_flows.zig").Flows.build(a, tree, groups);
        defer flows.deinit(a);
        for (self.events.items[begin..]) |*e| {
            if (e.section != section) return error.InvalidMemoEventBoundary;
            e.scope = try flows.get(e.paragraph);
        }
        var matched: usize = 0;
        // Links are not globally ordered by control_node (nested lists interleave).
        for (links) |link| {
            var lo: usize = 0;
            var hi = self.starts.items.len;
            while (lo < hi) {
                const mid = lo + (hi - lo) / 2;
                if (self.starts.items[mid].node < link.control_node) lo = mid + 1 else hi = mid;
            }
            if (lo == self.starts.items.len or self.starts.items[lo].node != link.control_node) continue;
            if (self.starts.items[lo].matched) return error.DuplicateMemoStartLink;
            self.starts.items[lo].matched = true;
            try self.events.append(a, .{ .section = section, .scope = try flows.get(link.paragraph_node), .paragraph = link.paragraph_node, .unit = link.start_unit, .value = .{ .start = self.starts.items[lo].index } });
            matched += 1;
        }
        if (matched != self.starts.items.len) return error.MissingMemoStartLink;
        self.starts.clearRetainingCapacity();
    }
};

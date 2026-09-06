const std = @import("std");
const Tree = @import("tree.zig").Tree;
const Flows = @import("paragraph_flows.zig").Flows;
const absent = std.math.maxInt(usize);
pub const Member = struct { paragraph_node: usize, flow: usize, group_index: usize, source_start: u64 };
pub const Group = struct { head_node: usize, flow: usize, member_count: usize = 0, source_units: u64 = 0 };
/// Observed 0/1 merge markers in one Section. Scalar indices refer to the
/// unchanged source Tree. Declared-unit offsets are NOT layout/final-text offsets.
pub const Index = struct {
    members: []Member,
    groups: []Group,
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        a.free(self.members);
        a.free(self.groups);
        self.* = undefined;
    }
    /// Reuse Flows built from this exact Tree; never infer owner from level alone.
    pub fn buildObserved(a: std.mem.Allocator, tree: Tree, flows: Flows) !Index {
        if (flows.owners.len != tree.nodes.len) return error.InvalidRevisionFlow;
        const last = try a.alloc(usize, tree.nodes.len);
        defer a.free(last);
        @memset(last, absent);
        var members: std.ArrayList(Member) = .empty;
        errdefer members.deinit(a);
        var groups: std.ArrayList(Group) = .empty;
        errdefer groups.deinit(a);
        for (tree.nodes, 0..) |node, i| {
            if (node.record.value != .header) continue;
            const flow = try flows.get(i);
            if (flow >= tree.nodes.len) return error.InvalidRevisionFlow;
            if (flow == 0) {
                if (node.parent != null) return error.InvalidRevisionFlow;
            } else if (tree.nodes[flow].record.value != .list_header or tree.nodes[flow].parent != node.parent) return error.InvalidRevisionFlow;
            const h = node.record.value.header;
            const merge = h.merge_tracking orelse return error.UnsupportedRevisionMergeValue;
            if (merge > 1) return error.UnsupportedRevisionMergeValue;
            if (merge == 0) {
                last[flow] = groups.items.len;
                try groups.append(a, .{ .head_node = i, .flow = flow });
            } else if (last[flow] == absent) return error.OrphanRevisionMerge;
            const group_index = last[flow];
            const group = &groups.items[group_index];
            try members.append(a, .{ .paragraph_node = i, .flow = flow, .group_index = group_index, .source_start = group.source_units });
            group.source_units = std.math.add(u64, group.source_units, h.characterUnits()) catch return error.RevisionCoordinateOverflow;
            group.member_count += 1;
        }
        const owned_members = try members.toOwnedSlice(a);
        errdefer a.free(owned_members);
        return .{ .members = owned_members, .groups = try groups.toOwnedSlice(a) };
    }
};

const std = @import("std");
const Tree = @import("tree.zig").Tree;
const Index = @import("revision_groups.zig").Index;
const projection = @import("revision_projection.zig");
const coordinates = @import("revision_coordinates.zig");
pub const Options = struct {
    paragraph: projection.Options = .{},
    max_total_input_bytes: usize = 64 * 1024 * 1024,
    max_total_output_bytes: usize = 64 * 1024 * 1024,
    max_total_ranges: usize = 100_000,
};
pub const Group = struct {
    head_node: usize,
    flow: usize,
    member_count: usize,
    source_units: u64,
    text: []u8 = &.{},
};
pub const Member = struct {
    paragraph_node: usize,
    group_index: usize,
    source_units: u32,
    projected_units: u32,
    source_start: u64,
    projected_start: u64,
    coordinates: coordinates.Map,
};
pub const Boundary = struct { group_index: usize, projected_unit: u64, removed_unit: bool };
/// Owns all text and coordinate maps; no source payload pointer survives.
/// Coordinates refer to supplied paragraph units, not unverified layout caches.
pub const Report = struct {
    groups: []Group,
    members: []Member,
    total_input_bytes: usize,
    total_output_bytes: usize,
    total_ranges: usize,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.groups) |g| a.free(g.text);
        a.free(self.groups);
        for (self.members) |*m| m.coordinates.deinit(a);
        a.free(self.members);
        self.* = undefined;
    }
    pub fn mapBoundary(self: Report, paragraph_node: usize, source_unit: u32) !Boundary {
        var lo: usize = 0;
        var hi = self.members.len;
        while (lo < hi) {
            const mid = lo + (hi - lo) / 2;
            if (self.members[mid].paragraph_node < paragraph_node) lo = mid + 1 else hi = mid;
        }
        if (lo == self.members.len or self.members[lo].paragraph_node != paragraph_node) return error.InvalidRevisionMember;
        const m = self.members[lo];
        const mapped = try m.coordinates.mapBoundary(source_unit);
        return .{ .group_index = m.group_index, .projected_unit = std.math.add(u64, m.projected_start, mapped.offset) catch return error.RevisionCoordinateOverflow, .removed_unit = mapped.removed_unit };
    }
};
/// Index must come from this same unchanged Tree. No new merge/owner inference.
pub fn collectObserved(a: std.mem.Allocator, tree: Tree, index: Index, options: Options) !Report {
    const parts = try a.alloc(?[]u8, index.members.len);
    @memset(parts, null);
    defer {
        for (parts) |p| if (p) |bytes| a.free(bytes);
        a.free(parts);
    }
    const sizes = try a.alloc(usize, index.groups.len);
    defer a.free(sizes);
    @memset(sizes, 0);
    const members = try a.alloc(Member, index.members.len);
    var initialized: usize = 0;
    errdefer {
        for (members[0..initialized]) |*m| m.coordinates.deinit(a);
        a.free(members);
    }
    const groups = try a.alloc(Group, index.groups.len);
    for (index.groups, 0..) |g, i| groups[i] = .{ .head_node = g.head_node, .flow = g.flow, .member_count = g.member_count, .source_units = g.source_units };
    errdefer {
        for (groups) |g| a.free(g.text);
        a.free(groups);
    }
    var input_left = options.max_total_input_bytes;
    var output_left = options.max_total_output_bytes;
    var ranges_left = options.max_total_ranges;
    for (index.members, 0..) |m, i| {
        if (m.paragraph_node >= tree.nodes.len or m.group_index >= groups.len) return error.InvalidRevisionMember;
        const node = tree.nodes[m.paragraph_node];
        if (node.record.value != .header) return error.InvalidRevisionMember;
        const h = node.record.value.header;
        const children = try @import("paragraph_children.zig").collect(tree, m.paragraph_node);
        try children.metadata.validateCounts(h);
        const text = if (children.text_node) |n| tree.nodes[n].record.value.text.raw else null;
        const ranges = children.metadata.ranges orelse try @import("range_tags.zig").Ranges.parse(&.{});
        var local = options.paragraph;
        local.max_input_bytes = @min(local.max_input_bytes, input_left);
        local.max_output_bytes = @min(local.max_output_bytes, output_left);
        local.max_ranges = @min(local.max_ranges, ranges_left);
        const projected = try projection.projectObservedMapped(a, text, h.characterUnits(), ranges, local);
        const bytes = projected.bytes;
        parts[i] = bytes;
        input_left -= if (text) |raw| raw.len else 2; // successful explicit observed CR
        output_left -= bytes.len;
        ranges_left -= ranges.count();
        members[i] = .{ .paragraph_node = m.paragraph_node, .group_index = m.group_index, .source_units = projected.coordinates.source_units, .projected_units = projected.coordinates.projected_units, .source_start = m.source_start, .projected_start = sizes[m.group_index] / 2, .coordinates = projected.coordinates };
        initialized += 1;
        sizes[m.group_index] += bytes.len; // bounded by the shared output budget
    }
    for (groups, sizes) |*g, size| g.text = try a.alloc(u8, size);
    for (members, parts) |m, p| {
        const bytes = p.?;
        const at: usize = @intCast(m.projected_start * 2);
        @memcpy(groups[m.group_index].text[at..][0..bytes.len], bytes);
    }
    return .{ .groups = groups, .members = members, .total_input_bytes = options.max_total_input_bytes - input_left, .total_output_bytes = options.max_total_output_bytes - output_left, .total_ranges = options.max_total_ranges - ranges_left };
}

const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, false);
}
pub fn mapped(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, true);
}
fn inspect(a: std.mem.Allocator, bytes: []const u8, limit: usize, query_mode: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const max_input = try r.readInt(u32);
    const max_output = try r.readInt(u32);
    const max_ranges = try r.readInt(u32);
    const cr = try r.readInt(u8);
    if (cr > 1) return error.InvalidMode;
    const query_count = if (query_mode) try r.readInt(u32) else 0;
    if (query_count > limit) return error.RevisionQueryLimit;
    const queries = try r.take(try std.math.mul(usize, query_count, 8));
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var lists = try core.hwp5.list_groups.Groups.build(a, tree);
    defer lists.deinit(a);
    var flows = try core.hwp5.paragraph_flows.Flows.build(a, tree, lists.items);
    defer flows.deinit(a);
    var index = try core.hwp5.revision_groups.Index.buildObserved(a, tree, flows);
    defer index.deinit(a);
    var report = try core.hwp5.revision_text.collectObserved(a, tree, index, .{ .max_total_input_bytes = max_input, .max_total_output_bytes = max_output, .max_total_ranges = max_ranges, .paragraph = .{ .missing_text = if (cr == 1) .observed_cr else .reject } });
    defer report.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (query_mode) {
        var q: core.Reader = .{ .bytes = queries };
        for (0..query_count) |_| {
            const node = try q.readInt(u32);
            const position = try q.readInt(u32);
            const mapped_position = try report.mapBoundary(node, position);
            try int(a, &out, u32, @intCast(mapped_position.group_index));
            try int(a, &out, u64, mapped_position.projected_unit);
            try int(a, &out, u32, @intFromBool(mapped_position.removed_unit));
        }
        return out.toOwnedSlice(a);
    }
    try int(a, &out, u32, @intCast(report.groups.len));
    try int(a, &out, u32, @intCast(report.members.len));
    inline for (.{ "total_input_bytes", "total_output_bytes", "total_ranges" }) |name| try int(a, &out, u32, @intCast(@field(report, name)));
    for (report.groups) |g| {
        inline for (.{ "head_node", "flow", "member_count" }) |name| try int(a, &out, u32, @intCast(@field(g, name)));
        try int(a, &out, u32, @intCast(g.text.len));
        try int(a, &out, u64, g.source_units);
        try out.appendSlice(a, g.text);
    }
    for (report.members) |m| {
        inline for (.{ "paragraph_node", "group_index", "source_units", "projected_units" }) |name| try int(a, &out, u32, @intCast(@field(m, name)));
        try int(a, &out, u64, m.source_start);
        try int(a, &out, u64, m.projected_start);
    }
    return out.toOwnedSlice(a);
}

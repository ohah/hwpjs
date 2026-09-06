const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var lists = try core.hwp5.list_groups.Groups.build(a, tree);
    defer lists.deinit(a);
    var flows = try core.hwp5.paragraph_flows.Flows.build(a, tree, lists.items);
    defer flows.deinit(a);
    var index = try core.hwp5.revision_groups.Index.buildObserved(a, tree, flows);
    defer index.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (index.members) |member| {
        const group = index.groups[member.group_index];
        try int(a, &out, u32, @intCast(member.paragraph_node));
        try int(a, &out, u32, @intCast(member.flow));
        try int(a, &out, u32, @intCast(group.head_node));
        try int(a, &out, u32, @intCast(group.member_count));
        try int(a, &out, u64, member.source_start);
        try int(a, &out, u64, group.source_units);
    }
    return out.toOwnedSlice(a);
}

const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const max_nodes = try r.readInt(u32);
    const max_depth = try r.readInt(u32);
    var tree = try core.hwp5.form_property_tree.Tree.parseObservedUnits(a, bytes[r.offset..], .{ .max_input_bytes = limit, .max_nodes = max_nodes, .max_depth = max_depth });
    defer tree.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(tree.nodes.len));
    for (tree.nodes) |node| {
        const p = node.property;
        try int(a, &out, u32, if (node.parent) |n| @intCast(n) else 0xffffffff);
        try int(a, &out, u32, @intCast(node.subtree_end));
        try int(a, &out, u32, @intFromEnum(p.kind));
        for ([_]usize{ p.offset, p.raw.len, p.key.len, p.value_offset, p.value.len }) |n| try int(a, &out, u32, @intCast(n));
        try out.appendSlice(a, p.key);
        // Set contents are represented once by their descendants, not recopied
        // at every ancestor (which would multiply wire size by nesting depth).
        if (p.kind != .set) try out.appendSlice(a, p.value);
    }
    return out.toOwnedSlice(a);
}

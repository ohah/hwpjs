const std = @import("std");
const h = @import("header.zig");
const Entry = @import("types.zig").Entry;
const PathBuilder = @import("path_builder.zig").PathBuilder;
pub fn build(a: std.mem.Allocator, entries: []Entry, max_path_bytes: usize) !void {
    const seen = try a.alloc(bool, entries.len);
    @memset(seen, false);
    seen[0] = true;
    var paths: PathBuilder = .{ .allocator = a, .remaining = max_path_bytes };
    entries[0].path = try paths.make("", entries[0].name, true);
    const Node = struct { id: u32, parent: u32 };
    var stack: std.ArrayList(Node) = .empty;
    try stack.append(a, .{ .id = entries[0].child, .parent = 0 });
    while (stack.pop()) |node| {
        if (node.id == h.free) continue;
        if (node.id >= entries.len) return error.InvalidDirectoryReference;
        if (seen[node.id]) return error.CyclicDirectory;
        seen[node.id] = true;
        const e = &entries[node.id];
        e.parent = node.parent;
        if (e.kind != 1 and e.kind != 2) return error.InvalidDirectory;
        const parent = entries[node.parent].path;
        e.path = try paths.make(parent, e.name, e.kind == 1);
        try stack.append(a, .{ .id = e.left, .parent = node.parent });
        try stack.append(a, .{ .id = e.right, .parent = node.parent });
        if (e.kind == 1) try stack.append(a, .{ .id = e.child, .parent = node.id });
    }
    for (entries, 0..) |*e, i| {
        if (!seen[i]) {
            if (e.kind != 0) return error.OrphanEntry;
            e.path = try paths.make("", e.name, true);
        }
    }
}

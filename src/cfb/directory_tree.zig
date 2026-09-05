const std = @import("std");
const h = @import("header.zig");
const Entry = @import("types.zig").Entry;
pub fn build(a: std.mem.Allocator, entries: []Entry, max_path_bytes: usize) !void {
    const seen = try a.alloc(bool, entries.len);
    @memset(seen, false);
    seen[0] = true;
    if (entries[0].name.len + 1 > max_path_bytes) return error.LimitExceeded;
    entries[0].path = try std.fmt.allocPrint(a, "{s}/", .{entries[0].name});
    const Node = struct { id: u32, parent: u32 };
    var stack: std.ArrayList(Node) = .empty;
    try stack.append(a, .{ .id = entries[0].child, .parent = 0 });
    var total = entries[0].path.len;
    while (stack.pop()) |node| {
        if (node.id == h.free) continue;
        if (node.id >= entries.len) return error.InvalidDirectoryReference;
        if (seen[node.id]) return error.CyclicDirectory;
        seen[node.id] = true;
        const e = &entries[node.id];
        if (e.kind != 1 and e.kind != 2) return error.InvalidDirectory;
        const parent = entries[node.parent].path;
        const length = parent.len + e.name.len + @intFromBool(e.kind == 1);
        if (length > max_path_bytes -| total) return error.LimitExceeded;
        total += length;
        e.path = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ parent, e.name, if (e.kind == 1) "/" else "" });
        try stack.append(a, .{ .id = e.left, .parent = node.parent });
        try stack.append(a, .{ .id = e.right, .parent = node.parent });
        if (e.kind == 1) try stack.append(a, .{ .id = e.child, .parent = node.id });
    }
    for (entries, 0..) |*e, i| {
        if (!seen[i]) {
            if (e.kind != 0) return error.OrphanEntry;
            e.path = try std.fmt.allocPrint(a, "{s}/", .{e.name});
        }
    }
}

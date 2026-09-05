const std = @import("std");
const h = @import("header.zig");
const Entry = @import("types.zig").Entry;
const names = @import("name_order.zig");

/// Caller-owned semantic input. Parent indices refer to this array, root at zero.
pub const Node = struct {
    name: []const u8,
    parent: u32 = h.free,
    kind: u8 = 2,
    clsid: [16]u8 = @splat(0),
    state: u32 = 0,
    created: u64 = 0,
    modified: u64 = 0,
    content: []const u8 = "",
};

const Sort = struct {
    nodes: []const Node,
    keys: []const names.Name,
    fn less(self: Sort, x: u32, y: u32) bool {
        if (self.nodes[x].parent != self.nodes[y].parent) return self.nodes[x].parent < self.nodes[y].parent;
        return names.order(self.keys[x], self.keys[y]) == .lt;
    }
};

// Depth is logarithmic in sibling count; every node is black, as §2.6.4 permits.
fn tree(entries: []Entry, ids: []const u32) u32 {
    if (ids.len == 0) return h.free;
    const mid = ids.len / 2;
    const id = ids[mid];
    entries[id].left = tree(entries, ids[0..mid]);
    entries[id].right = tree(entries, ids[mid + 1 ..]);
    return id;
}

pub fn prepare(a: std.mem.Allocator, nodes: []const Node, options: @import("types.zig").Options) ![]Entry {
    if (nodes.len == 0 or nodes[0].kind != 5 or nodes[0].parent != h.free) return error.InvalidRoot;
    if (nodes.len > options.max_entries or nodes.len > 0xfffffffa) return error.LimitExceeded;
    const entries = try a.alloc(Entry, nodes.len);
    const keys = try a.alloc(names.Name, nodes.len);
    const ids = try a.alloc(u32, nodes.len - 1);
    var total: usize = 0;
    for (nodes, 0..) |node, i| {
        keys[i] = try names.Name.init(node.name);
        if (i != 0) {
            if ((node.kind != 1 and node.kind != 2) or node.parent >= nodes.len or node.parent == i) return error.InvalidDirectoryReference;
            if (nodes[node.parent].kind != 1 and nodes[node.parent].kind != 5) return error.InvalidDirectoryReference;
            ids[i - 1] = @intCast(i);
        }
        if (node.kind != 2 and node.content.len != 0) return error.InvalidStorage;
        if (node.content.len > options.max_stream_bytes or node.content.len > options.max_total_stream_bytes -| total) return error.LimitExceeded;
        total += node.content.len;
        entries[i] = .{ .name = node.name, .kind = node.kind, .parent = node.parent, .color = 1, .left = h.free, .right = h.free, .child = h.free, .clsid = node.clsid, .state = node.state, .created = node.created, .modified = node.modified, .start = if (node.kind == 1) 0 else h.end, .size = node.content.len, .content = node.content };
        try @import("entry_rules.zig").validate(entries[i], i);
    }
    std.mem.sort(u32, ids, Sort{ .nodes = nodes, .keys = keys }, Sort.less);
    var first: usize = 0;
    while (first < ids.len) {
        var last = first + 1;
        const parent = nodes[ids[first]].parent;
        while (last < ids.len and nodes[ids[last]].parent == parent) : (last += 1) {
            if (names.order(keys[ids[last - 1]], keys[ids[last]]) == .eq) return error.DuplicateName;
        }
        entries[parent].child = tree(entries, ids[first..last]);
        first = last;
    }
    try @import("directory_tree.zig").build(a, entries, options.max_path_bytes);
    return entries;
}

pub fn encode(out: []u8, entry: Entry) !void {
    @memset(out, 0);
    const key = try names.Name.init(entry.name);
    for (key.units[0..key.len], 0..) |unit, i| put(u16, out, i * 2, unit);
    put(u16, out, 64, @intCast((key.len + 1) * 2));
    out[66] = entry.kind;
    out[67] = entry.color;
    put(u32, out, 68, entry.left);
    put(u32, out, 72, entry.right);
    put(u32, out, 76, entry.child);
    @memcpy(out[80..96], &entry.clsid);
    put(u32, out, 96, entry.state);
    put(u64, out, 100, entry.created);
    put(u64, out, 108, entry.modified);
    put(u32, out, 116, entry.start);
    put(u64, out, 120, entry.size);
}

pub fn put(comptime T: type, out: []u8, offset: usize, value: T) void {
    std.mem.writeInt(T, out[offset..][0..@sizeOf(T)], value, .little);
}

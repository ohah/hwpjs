const std = @import("std");
const h = @import("header.zig");
const Entry = @import("types.zig").Entry;
const names = @import("name_order.zig");

pub fn header(bytes: []const u8, head: h.Header) !void {
    if (bytes.len < 3 * head.sector_size or bytes.len % head.sector_size != 0) return error.InvalidFileSize;
    if ((head.major == 3 and bytes.len > 0x80000000) or (bytes.len / head.sector_size - 1 > 0xfffffffb)) return error.InvalidFileSize;
    if (!std.mem.allEqual(u8, bytes[8..24], 0) or head.byte_order != 0xfffe or
        !std.mem.allEqual(u8, bytes[512..head.sector_size], 0)) return error.InvalidHeader;
    if (head.mini_count == 0 and head.mini_start != h.end) return error.InvalidMiniChain;
}

pub fn directory(a: std.mem.Allocator, data: []const u8, entries: []const Entry, major: u16) !void {
    const keys = try a.alloc(names.Name, entries.len);
    for (entries, 0..) |e, i| {
        const raw = data[i * 128 ..][0..128];
        if (e.kind == 0) {
            for (raw, 0..) |byte, j| if (byte != @as(u8, if (j >= 68 and j < 80) 255 else 0)) return error.InvalidUnusedEntry;
            continue;
        }
        keys[i] = try names.Name.init(e.name);
        if ((keys[i].len + 1) * 2 != try h.int(u16, raw, 64)) return error.InvalidName;
        try @import("entry_rules.zig").validate(e, i);
        if (e.kind == 1 and try h.int(u64, raw, 120) != 0) return error.InvalidStorage;
        if (major == 3 and e.size >= 0x80000000) return error.InvalidStreamSize;
    }
    // Validate global BST bounds, not merely immediate L/R relationships.
    const Node = struct { id: u32, low: ?u32 = null, high: ?u32 = null, red: bool = false };
    var stack: std.ArrayList(Node) = .empty;
    try stack.append(a, .{ .id = entries[0].child });
    while (stack.pop()) |node| {
        if (node.id == h.free) continue;
        const e = entries[node.id]; // tree.build has already checked reachability/cycles/indices.
        if (node.red and e.color == 0) return error.InvalidTreeColor;
        if (node.low) |low| if (names.order(keys[low], keys[node.id]) != .lt) return error.InvalidNameOrder;
        if (node.high) |high| if (names.order(keys[node.id], keys[high]) != .lt) return error.InvalidNameOrder;
        try stack.append(a, .{ .id = e.left, .low = node.low, .high = node.id, .red = e.color == 0 });
        try stack.append(a, .{ .id = e.right, .low = node.id, .high = node.high, .red = e.color == 0 });
        if (e.kind == 1) try stack.append(a, .{ .id = e.child });
    }
}

pub fn rangeLock(sector_size: usize) usize {
    return 0x7fffffff / sector_size - 1;
}

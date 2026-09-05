const std = @import("std");
const h = @import("header.zig");
const Entry = @import("types.zig").Entry;
pub fn parse(a: std.mem.Allocator, directory: []const u8, header: h.Header, max_entries: usize) ![]Entry {
    if (header.major == 4 and (directory.len % header.sector_size != 0 or
        directory.len / header.sector_size != header.directory_count))
        return error.InvalidDirectoryCount;
    if (directory.len == 0 or directory.len % 128 != 0) return error.InvalidDirectory;
    if (directory.len / 128 > max_entries) return error.LimitExceeded;
    const entries = try a.alloc(Entry, directory.len / 128);
    for (entries, 0..) |*entry, i| {
        const data = directory[i * 128 ..][0..128];
        entry.* = .{
            .name = try @import("directory_name.zig").decode(a, data, data[66] != 0),
            .kind = data[66],
            .color = data[67],
            .left = try h.int(u32, data, 68),
            .right = try h.int(u32, data, 72),
            .child = try h.int(u32, data, 76),
            .clsid = data[80..96].*,
            .state = try h.int(u32, data, 96),
            .created = try h.int(u64, data, 100),
            .modified = try h.int(u64, data, 108),
            .start = try h.int(u32, data, 116),
            .size = if (header.major == 3) try h.int(u32, data, 120) else try h.int(u64, data, 120),
        };
        if (entry.kind != 0 and entry.kind != 1 and entry.kind != 2 and entry.kind != 5)
            return error.InvalidDirectory;
        if (entry.kind != 0 and entry.color > 1) return error.InvalidDirectory;
        if (entry.kind == 2 and entry.child != h.free) return error.InvalidDirectoryReference;
        if (entry.kind == 5 and (entry.left != h.free or entry.right != h.free))
            return error.InvalidDirectoryReference;
    }

    if (entries[0].kind != 5) return error.InvalidRoot;
    return entries;
}

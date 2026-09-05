const std = @import("std");
const h = @import("header.zig");
const Entry = @import("types.zig").Entry;
pub fn parse(a: std.mem.Allocator, directory: []const u8, header: h.Header, max_entries: usize) ![]Entry {
    if (directory.len == 0 or directory.len % 128 != 0) return error.InvalidDirectory;
    if (directory.len / 128 > max_entries) return error.LimitExceeded;
    const entries = try a.alloc(Entry, directory.len / 128);
    for (entries, 0..) |*entry, i| {
        const data = directory[i * 128 ..][0..128];
        const name_len = try h.int(u16, data, 64);
        if (name_len > 64 or name_len % 2 != 0) return error.InvalidName;
        var units: [32]u16 = undefined;
        var unit_count: usize = 0;
        for (0..name_len / 2) |j| {
            const unit = try h.int(u16, data, j * 2);
            if (unit != 0) {
                units[unit_count] = unit;
                unit_count += 1;
            }
        }
        entry.* = .{
            .name = try std.unicode.utf16LeToUtf8Alloc(a, units[0..unit_count]),
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
    }

    if (entries[0].kind != 5) return error.InvalidRoot;
    return entries;
}

const std = @import("std");
const h = @import("header.zig");
const Sectors = @import("sectors.zig").Sectors;
/// Temporary arena-owned allocation tables and ownership marks.
pub const Allocation = struct {
    const Role = enum { unclaimed, stream, fat, difat };
    a: std.mem.Allocator,
    sectors: Sectors,
    fat: []u32 = &.{},
    used: []Role = &.{},
    fn sector(self: *Allocation, id: u32) ![]const u8 {
        return self.sectors.get(id);
    }
    fn claim(self: *Allocation, id: u32, role: Role) !void {
        if (id >= self.used.len) return error.InvalidSector;
        if (self.used[id] != .unclaimed) return error.CyclicOrSharedSector;
        self.used[id] = role;
    }

    pub fn chain(self: *Allocation, start: u32, expected: ?usize) ![]u8 {
        var list: std.ArrayList(u8) = .empty;
        var id = start;
        var remaining = expected;
        while (id != h.end and id != h.free) {
            if (id >= self.fat.len) return error.InvalidSector;
            if (self.fat[id] == h.free) return error.UnallocatedSector;
            try self.claim(id, .stream);
            const part = try self.sector(id);
            const count = if (remaining) |r| @min(r, part.len) else part.len;
            try list.appendSlice(self.a, part[0..count]);
            if (remaining) |r| remaining = r - count;
            id = self.fat[id];
        }
        if (remaining) |r| if (r != 0) return error.TruncatedStream;
        return list.toOwnedSlice(self.a);
    }

    pub fn init(self: *Allocation) !void {
        const header = self.sectors.header;
        const n = self.sectors.count();
        if (header.fat_count > n or header.difat_count > n or header.mini_count > n)
            return error.InvalidHeader;
        self.used = try self.a.alloc(Role, n);
        @memset(self.used, .unclaimed);
        var fats: std.ArrayList(u32) = .empty;
        for (0..109) |i| {
            const id = try h.int(u32, self.sectors.bytes, 76 + 4 * i);
            if (id >= h.difat_sector) break;
            try fats.append(self.a, id);
        }
        var difat = header.difat_start;
        for (0..header.difat_count) |_| {
            try self.claim(difat, .difat);
            const part = try self.sector(difat);
            if (part.len != header.sector_size) return error.Truncated;
            for (0..header.sector_size / 4 - 1) |i| {
                const id = try h.int(u32, part, i * 4);
                if (id < h.difat_sector) try fats.append(self.a, id);
            }
            difat = try h.int(u32, part, part.len - 4);
        }
        if (difat != h.end and difat != h.free) return error.InvalidDifat;
        if (fats.items.len != header.fat_count) return error.InvalidFat;
        self.fat = try self.a.alloc(u32, n);
        @memset(self.fat, h.free);
        for (fats.items, 0..) |id, index| {
            try self.claim(id, .fat);
            const part = try self.sector(id);
            if (part.len != header.sector_size) return error.Truncated;
            for (0..part.len / 4) |j| {
                const dest = index * (part.len / 4) + j;
                if (dest >= n) break;
                self.fat[dest] = try h.int(u32, part, j * 4);
            }
        }
        // Allocation roles inferred from DIFAT must agree with the FAT itself.
        for (self.used, self.fat) |role, marker| switch (role) {
            .fat => if (marker != h.fat_sector) return error.InvalidFat,
            .difat => if (marker != h.difat_sector) return error.InvalidDifat,
            else => {},
        };
    }
};

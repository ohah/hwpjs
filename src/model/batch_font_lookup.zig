//! Stack-owned lookup of successful ensures in one Native command transaction.
//! Slots borrow command strings only until that command batch returns.
const std = @import("std");
pub const Cache = struct {
    slots: [7]?Entry = @splat(null),
    hits: usize = 0,
    misses: usize = 0,
    pub const Entry = struct { name: []const u8, id: u32 };
    pub fn get(self: *Cache, language: usize, name: []const u8) ?u32 {
        if (self.slots[language]) |entry| if (std.mem.eql(u8, entry.name, name)) {
            self.hits += 1;
            return entry.id;
        };
        self.misses += 1;
        return null;
    }
    pub fn put(self: *Cache, language: usize, name: []const u8, id: u32) void {
        self.slots[language] = .{ .name = name, .id = id };
    }
    pub fn clear(self: *Cache) void {
        self.slots = @splat(null);
    }
};

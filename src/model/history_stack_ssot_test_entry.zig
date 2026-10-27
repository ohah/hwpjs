const std = @import("std");
pub const Owner = struct {
    allocator: std.mem.Allocator,
    bytes: []u8,
    retained_by: ?*const anyopaque = null,
    pub fn create(a: std.mem.Allocator, n: usize) !*Owner {
        const s = try a.create(Owner);
        errdefer a.destroy(s);
        s.* = .{ .allocator = a, .bytes = try a.alloc(u8, n) };
        return s;
    }
    pub fn ownedBytes(self: *const Owner) usize {
        return @sizeOf(Owner) + self.bytes.len;
    }
    pub fn deinit(self: *Owner) void {
        const a = self.allocator;
        a.free(self.bytes);
        a.destroy(self);
    }
};
pub const Entry = struct {
    pub const CheckpointOwner = Owner;
    allocator: std.mem.Allocator,
    bytes: []u8,
    ready: bool = true,
    payload_bytes: usize,
    retained_by: ?*const anyopaque = null,
    revision: u32 = 0,
    checkpoint: ?*Owner = null,
    cost_calls: ?*usize = null,
    pub fn create(a: std.mem.Allocator, n: usize) !*Entry {
        const s = try a.create(Entry);
        errdefer a.destroy(s);
        s.* = .{ .allocator = a, .bytes = try a.alloc(u8, n), .payload_bytes = n };
        return s;
    }
    pub fn ownedBytes(self: *const Entry) usize {
        if (self.cost_calls) |count| count.* += 1;
        return @sizeOf(Entry) + self.bytes.len + if (self.checkpoint) |owner| owner.ownedBytes() else @as(usize, 0);
    }
    pub fn attach(self: *Entry, owner: *Owner) void {
        std.debug.assert(self.checkpoint == null and owner.retained_by == null);
        owner.retained_by = self;
        self.checkpoint = owner;
    }
    pub fn deinit(self: *Entry) void {
        const a = self.allocator;
        if (self.checkpoint) |owner| owner.deinit();
        a.free(self.bytes);
        a.destroy(self);
    }
};
pub const Restore = struct {
    fail: bool = false,
    revision: u32 = 0,
    pub fn apply(e: *const Entry, c: *Restore) !void {
        if (c.fail) return error.OutOfMemory;
        c.revision = e.revision;
    }
};

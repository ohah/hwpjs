//! Stable owner nodes. Arena-backed values never enter the live session.
const std = @import("std");
pub const Meter = struct {
    backing: std.mem.Allocator,
    limit: usize,
    live: usize = 0,
    peak: usize = 0,
    last_failure: enum { none, limit, backing } = .none,
    pub fn allocator(self: *Meter) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
    }
    fn next(self: *Meter, removed: usize, added: usize) ?usize {
        const n = std.math.add(usize, self.live - removed, added) catch {
            self.last_failure = .limit;
            return null;
        };
        if (n > self.limit) {
            self.last_failure = .limit;
            return null;
        }
        return n;
    }
    fn set(self: *Meter, n: usize) void {
        self.live = n;
        self.peak = @max(self.peak, n);
    }
    fn alloc(ctx: *anyopaque, n: usize, alignment: std.mem.Alignment, address: usize) ?[*]u8 {
        const s: *Meter = @ptrCast(@alignCast(ctx));
        const count = s.next(0, n) orelse return null;
        const p = s.backing.rawAlloc(n, alignment, address) orelse {
            s.last_failure = .backing;
            return null;
        };
        s.set(count);
        return p;
    }
    fn resize(ctx: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, n: usize, address: usize) bool {
        const s: *Meter = @ptrCast(@alignCast(ctx));
        const count = s.next(bytes.len, n) orelse return false;
        if (!s.backing.rawResize(bytes, alignment, n, address)) return false;
        s.set(count);
        return true;
    }
    fn remap(ctx: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, n: usize, address: usize) ?[*]u8 {
        const s: *Meter = @ptrCast(@alignCast(ctx));
        const count = s.next(bytes.len, n) orelse return null;
        const p = s.backing.rawRemap(bytes, alignment, n, address) orelse return null;
        s.set(count);
        return p;
    }
    fn free(ctx: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, address: usize) void {
        const s: *Meter = @ptrCast(@alignCast(ctx));
        s.backing.rawFree(bytes, alignment, address);
        s.live -= bytes.len;
    }
};
pub fn Entry(comptime Value: type, comptime dispose: fn (*Value) void) type {
    return struct {
        const Self = @This();
        backing: std.mem.Allocator,
        meter: Meter,
        arena: std.heap.ArenaAllocator,
        value: Value = undefined,
        ready: bool = false,
        payload_bytes: usize = 0,
        revision: u32 = 0,
        retained_by: ?*const anyopaque = null,
        pub fn create(a: std.mem.Allocator, total_limit: usize, explicit_owned_limit: ?u32) !*Self {
            const limit = @min(total_limit, if (explicit_owned_limit) |n| @as(usize, n) else total_limit);
            if (limit < @sizeOf(Self)) return error.HistoryEntryOwnedLimitExceeded;
            const s = try a.create(Self);
            s.* = .{ .backing = a, .meter = .{ .backing = a, .limit = limit - @sizeOf(Self) }, .arena = undefined };
            s.arena = std.heap.ArenaAllocator.init(s.meter.allocator());
            return s;
        }
        pub fn allocator(self: *Self) std.mem.Allocator {
            return self.arena.allocator();
        }
        pub fn finish(self: *Self, value: Value, payload: usize) void {
            std.debug.assert(!self.ready);
            self.value = value;
            self.payload_bytes = payload;
            self.ready = true;
        }
        pub fn ownedBytes(self: *const Self) usize {
            return @sizeOf(Self) + self.meter.live;
        }
        pub fn captureError(self: *const Self, err: anyerror) anyerror {
            return if (err == error.OutOfMemory and self.meter.last_failure == .limit) error.HistoryEntryOwnedLimitExceeded else err;
        }
        pub fn deinit(self: *Self) void {
            const a = self.backing;
            if (self.ready) dispose(&self.value);
            self.arena.deinit();
            std.debug.assert(self.meter.live == 0);
            a.destroy(self);
        }
    };
}

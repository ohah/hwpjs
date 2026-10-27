//! Bounds only call-local projection/preflight storage, not live Session/History.
const std = @import("std");
pub const Budget = struct {
    backing: std.mem.Allocator,
    limit: usize,
    live: usize = 0,
    peak: usize = 0,
    exceeded: bool = false,
    pub fn allocator(self: *Budget) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
    }
    pub fn classify(self: *const Budget, err: anyerror) anyerror {
        return if (err == error.OutOfMemory and self.exceeded) error.LimitExceeded else err;
    }
    fn alloc(context: *anyopaque, length: usize, alignment: std.mem.Alignment, address: usize) ?[*]u8 {
        const self: *Budget = @ptrCast(@alignCast(context));
        self.exceeded = false; // Classify the terminal allocation, not an earlier failed growth probe.
        if (length > self.limit - self.live) {
            self.exceeded = true;
            return null;
        }
        const result = self.backing.rawAlloc(length, alignment, address) orelse return null;
        self.live += length;
        self.peak = @max(self.peak, self.live);
        return result;
    }
    // Force allocate/copy/free so realloc growth is charged before allocation.
    fn resize(_: *anyopaque, _: []u8, _: std.mem.Alignment, _: usize, _: usize) bool {
        return false;
    }
    fn remap(_: *anyopaque, _: []u8, _: std.mem.Alignment, _: usize, _: usize) ?[*]u8 {
        return null;
    }
    fn free(context: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, address: usize) void {
        const self: *Budget = @ptrCast(@alignCast(context));
        self.backing.rawFree(bytes, alignment, address);
        self.live -= bytes.len;
    }
};

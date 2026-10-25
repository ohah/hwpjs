//! Test adapter: force allocate/copy/free fallback instead of in-place growth.
const std = @import("std");
pub const NoResize = struct {
    backing: std.mem.Allocator,
    pub fn allocator(self: *NoResize) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
    }
    fn alloc(context: *anyopaque, length: usize, alignment: std.mem.Alignment, address: usize) ?[*]u8 {
        const self: *NoResize = @ptrCast(@alignCast(context));
        return self.backing.rawAlloc(length, alignment, address);
    }
    fn resize(_: *anyopaque, _: []u8, _: std.mem.Alignment, _: usize, _: usize) bool {
        return false;
    }
    fn remap(_: *anyopaque, _: []u8, _: std.mem.Alignment, _: usize, _: usize) ?[*]u8 {
        return null;
    }
    fn free(context: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, address: usize) void {
        const self: *NoResize = @ptrCast(@alignCast(context));
        self.backing.rawFree(bytes, alignment, address);
    }
};

test "no resize test allocator preserves allocation ownership on refused growth" {
    var tracking = std.testing.FailingAllocator.init(std.testing.allocator, .{});
    var wrapper: NoResize = .{ .backing = tracking.allocator() };
    const allocator = wrapper.allocator();
    const bytes = try allocator.alloc(u8, 32);
    @memset(bytes, 42);
    try std.testing.expect(!allocator.resize(bytes, 64));
    try std.testing.expect(allocator.remap(bytes, 64) == null);
    for (bytes) |byte| try std.testing.expectEqual(@as(u8, 42), byte);
    allocator.free(bytes);
    try std.testing.expectEqual(@as(usize, 1), tracking.allocations);
    try std.testing.expectEqual(tracking.allocated_bytes, tracking.freed_bytes);
}

const std = @import("std");
const scratch = @import("stack_fallback.zig");

test "scratch fallback keeps bounded aligned storage independent of heap failure" {
    var backing = std.testing.FailingAllocator.init(std.testing.allocator, .{ .fail_index = 0 });
    var buffer = scratch.stackFallback(128, backing.allocator());
    const a = buffer.get();
    var small = try a.alignedAlloc(u8, .@"16", 32);
    defer a.free(small);
    try std.testing.expect(buffer.fixed.ownsSlice(small));
    @memset(small, 0x5a);
    try std.testing.expectError(error.OutOfMemory, a.alloc(u8, 256));
    for (small) |byte| try std.testing.expectEqual(@as(u8, 0x5a), byte);
    try std.testing.expect(a.resize(small, 16));
    small = small[0..16];
    try std.testing.expectEqual(@as(usize, 0), backing.alloc_index);
}

test "scratch fallback remaps both owners and releases every failed allocation" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(backing: std.mem.Allocator) !void {
            var buffer = scratch.stackFallback(32, backing);
            const a = buffer.get();
            var small = try a.alloc(u8, 16);
            defer a.free(small);
            @memset(small, 0x37);
            small = try a.realloc(small, 24);
            try std.testing.expect(buffer.fixed.ownsSlice(small));
            for (small[0..16]) |byte| try std.testing.expectEqual(@as(u8, 0x37), byte);
            var large = try a.alloc(u8, 256);
            defer a.free(large);
            try std.testing.expect(!buffer.fixed.ownsSlice(large));
            @memset(large, 0x42);
            large = try a.realloc(large, 512);
            for (large[0..256]) |byte| try std.testing.expectEqual(@as(u8, 0x42), byte);
        }
    }.run, .{});
}

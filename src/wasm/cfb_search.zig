const state = @import("cfb.zig");
const allocator = @import("memory.zig").allocator;
const snapshot = @import("search_snapshot.zig");

export fn cfb_find_snapshot(ptr: [*]const u8, size: usize, query: [*]const u8, query_size: usize) i32 {
    const index = snapshot.find(allocator, ptr[0..size], query[0..query_size]) catch |err| return state.fail(err);
    return if (index) |i| @intCast(i) else -1;
}

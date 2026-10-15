//! Full failing-allocation sweep with explicit leak checks and no per-allocation traces.
const std = @import("std");

pub fn check(comptime callback: anytype, args: anytype) !void {
    var debug: @import("checked_allocator.zig").Debug = .{};
    const result = std.testing.checkAllAllocationFailures(debug.allocator(), callback, args);
    const leak_status = debug.deinit();
    if (leak_status != .ok) return error.TestAllocatorLeak;
    try result;
}

test "allocation sweep retains every failure index and detects swallowed OOM" {
    var calls: usize = 0;
    try check(struct {
        fn run(a: std.mem.Allocator, count: *usize) !void {
            count.* += 1;
            const first = try a.alloc(u8, 16);
            defer a.free(first);
            const second = try a.alloc(u8, 128);
            defer a.free(second);
        }
    }.run, .{&calls});
    try std.testing.expectEqual(@as(usize, 3), calls);
    try std.testing.expectError(error.SwallowedOutOfMemoryError, check(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = a.alloc(u8, 1) catch return;
            defer a.free(bytes);
        }
    }.run, .{}));
}

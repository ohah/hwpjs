//! Full failing-allocation sweep with explicit leak checks and no per-allocation traces.
const std = @import("std");
// One ordinary success control plus std's fallback success baseline.
pub const success_controls: usize = 2;

pub fn check(comptime callback: anytype, args: anytype) !void {
    // Keep the real allocator's successful resize/remap path as a separate
    // checked control; failure injection then forces every fallback allocation.
    try @import("checked_allocator.zig").run(callback, args);
    var debug: @import("checked_allocator.zig").Debug = .{};
    var no_resize: @import("no_resize_allocator.zig").NoResize = .{ .backing = debug.allocator() };
    const result = std.testing.checkAllAllocationFailures(no_resize.allocator(), callback, args);
    const leak_status = debug.deinit();
    if (leak_status != .ok) return error.TestAllocatorLeak;
    try result;
}

test "allocation sweep exercises every allocate copy growth fallback deterministically" {
    var calls: usize = 0;
    try check(struct {
        fn run(a: std.mem.Allocator, count: *usize) !void {
            count.* += 1;
            var bytes = try a.alloc(u8, 32);
            defer a.free(bytes);
            @memset(bytes, 42);
            bytes = try a.realloc(bytes, 128);
            bytes = try a.realloc(bytes, 1024);
            for (bytes[0..32]) |byte| try std.testing.expectEqual(@as(u8, 42), byte);
        }
    }.run, .{&calls});
    try std.testing.expectEqual(@as(usize, 3) + success_controls, calls);
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
    try std.testing.expectEqual(@as(usize, 2) + success_controls, calls);
    try std.testing.expectError(error.SwallowedOutOfMemoryError, check(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = a.alloc(u8, 1) catch return;
            defer a.free(bytes);
        }
    }.run, .{}));
}

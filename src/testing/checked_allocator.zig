//! Safety and leak checks without per-allocation stack trace storage.
const std = @import("std");
pub const Debug = std.heap.DebugAllocator(.{ .stack_trace_frames = 0, .safety = true });

pub fn run(comptime callback: anytype, args: anytype) !void {
    var debug: Debug = .{};
    const result = @call(.auto, callback, .{debug.allocator()} ++ args);
    const status = debug.deinit();
    if (status != .ok) return error.TestAllocatorLeak;
    try result;
}

test "checked allocator retains callback errors and releases scoped buffers" {
    try run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try a.alloc(u8, 32);
            defer a.free(bytes);
        }
    }.run, .{});
    try std.testing.expectError(error.ExpectedCallbackFailure, run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try a.alloc(u8, 32);
            defer a.free(bytes);
            return error.ExpectedCallbackFailure;
        }
    }.run, .{}));
}

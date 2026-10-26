//! Bounded diagnostics, not a replacement for full allocation failure sweeps.
const std = @import("std");
pub const requested_limit = 64 * 1024 * 1024;
pub const Stats = struct { allocations: usize, allocated_bytes: usize, freed_bytes: usize };

pub fn measure(comptime callback: anytype, args: anytype, fail_index: ?usize) !Stats {
    return measureMode(false, callback, args, fail_index);
}

pub fn measureFallback(comptime callback: anytype, args: anytype, fail_index: ?usize) !Stats {
    return measureMode(true, callback, args, fail_index);
}

fn measureMode(comptime fallback: bool, comptime callback: anytype, args: anytype, fail_index: ?usize) !Stats {
    var checked: std.heap.DebugAllocator(.{ .stack_trace_frames = 0, .safety = true, .enable_memory_limit = true }) = .{};
    defer std.testing.expect(checked.deinit() == .ok) catch @panic("ProbeLeak");
    checked.requested_memory_limit = requested_limit;
    var no_resize: @import("no_resize_allocator.zig").NoResize = .{ .backing = checked.allocator() };
    var counted = std.testing.FailingAllocator.init(if (fallback) no_resize.allocator() else checked.allocator(), .{ .fail_index = fail_index orelse std.math.maxInt(usize) });
    const result = @call(.auto, callback, .{counted.allocator()} ++ args);
    if (fail_index != null) {
        if (result) |_| {
            return if (counted.has_induced_failure) error.SwallowedOutOfMemoryError else error.FailureIndexNotReached;
        } else |err| {
            if (err != error.OutOfMemory) return err;
            if (!counted.has_induced_failure) return error.UninducedOutOfMemory;
        }
    } else {
        try result;
        try std.testing.expect(!counted.has_induced_failure);
    }
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try std.testing.expectEqual(counted.allocated_bytes, counted.freed_bytes);
    return .{ .allocations = counted.allocations, .allocated_bytes = counted.allocated_bytes, .freed_bytes = counted.freed_bytes };
}

fn one(a: std.mem.Allocator) !void {
    const bytes = try a.alloc(u8, 24);
    defer a.free(bytes);
}

test "bounded fallback allocation count includes refused resize copies and exact failure indices" {
    const Growth = struct {
        fn run(a: std.mem.Allocator) !void {
            var bytes = try a.alloc(u8, 32);
            defer a.free(bytes);
            @memset(bytes, 42);
            bytes = try a.realloc(bytes, 64);
            for (bytes[0..32]) |byte| try std.testing.expectEqual(@as(u8, 42), byte);
        }
    };
    const baseline = try measureFallback(Growth.run, .{}, null);
    try std.testing.expectEqual(@as(usize, 2), baseline.allocations);
    try std.testing.expectEqual(@as(usize, 96), baseline.allocated_bytes);
    for (0..baseline.allocations) |index| _ = try measureFallback(Growth.run, .{}, index);
    try std.testing.expectError(error.FailureIndexNotReached, measureFallback(Growth.run, .{}, baseline.allocations));
}

test "bounded allocation probe rejects swallowed uninduced and missing failure indices" {
    const baseline = try measure(one, .{}, null);
    try std.testing.expectEqual(@as(usize, 1), baseline.allocations);
    try std.testing.expectEqual(@as(usize, 24), baseline.allocated_bytes);
    _ = try measure(one, .{}, 0);
    try std.testing.expectError(error.FailureIndexNotReached, measure(one, .{}, 1));
    try std.testing.expectError(error.SwallowedOutOfMemoryError, measure(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = a.alloc(u8, 1) catch return;
            defer a.free(bytes);
        }
    }.run, .{}, 0));
    try std.testing.expectError(error.UninducedOutOfMemory, measure(struct {
        fn run(_: std.mem.Allocator) !void {
            return error.OutOfMemory;
        }
    }.run, .{}, 0));
    try std.testing.expectError(error.UninducedOutOfMemory, measure(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try a.alloc(u8, requested_limit + 1);
            defer a.free(bytes);
        }
    }.run, .{}, 1));
    try std.testing.expectError(error.InvalidSyntheticInput, measure(struct {
        fn run(_: std.mem.Allocator) !void {
            return error.InvalidSyntheticInput;
        }
    }.run, .{}, 0));
}

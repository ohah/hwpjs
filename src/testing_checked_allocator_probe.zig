// Intentional failures: standalone negative controls, not imported by root.zig.
const std = @import("std");
const checked = @import("testing/checked_allocator.zig");

test "checked allocator probe positive preserves full failure injection and global diagnostics" {
    try std.testing.expect(std.options.allow_stack_tracing);
    var calls: usize = 0;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, count: *usize) !void {
            count.* += 1;
            const first = try a.alloc(u8, 16);
            defer a.free(first);
            const second = try a.alloc(u8, 32);
            defer a.free(second);
        }
    }.run, .{&calls});
    try std.testing.expectEqual(@as(usize, 3), calls);
}

test "checked allocator probe deliberate leak must fail" {
    try checked.run(struct {
        fn run(a: std.mem.Allocator) !void {
            _ = try a.alloc(u8, 32);
        }
    }.run, .{});
}

test "checked allocator probe deliberate assertion must fail" {
    try checked.run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try a.alloc(u8, 32);
            defer a.free(bytes);
            try std.testing.expect(false);
        }
    }.run, .{});
}

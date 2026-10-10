//! Intentional failing executable test; never register in the normal root suite.
const std = @import("std");
test "negative deliberate leak must fail the checked allocation sweep" {
    try @import("allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            _ = try a.alloc(u8, 32);
        }
    }.run, .{});
}

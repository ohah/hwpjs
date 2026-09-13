const std = @import("std");
// Ownership of the test wire transfers to the caller; preceding chart state
// is released after serialization, as in the original mode 328.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-series-label-prefix.zig").read(a, bytes, limit);
    defer prefix.previous.deinit();
    return prefix.wire;
}

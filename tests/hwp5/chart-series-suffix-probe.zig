const std = @import("std");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var prefix = try @import("chart-series-suffix-prefix.zig").read(a, bytes, limit);
    defer prefix.previous.deinit();
    return prefix.wire;
}

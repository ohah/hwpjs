//! H5T1 bounded framing shared by source-tree and current-model projections.
const std = @import("std");
pub const max_output = 64 * 1024 * 1024;
pub fn cast(value: usize) !u32 {
    return std.math.cast(u32, value) orelse error.LimitExceeded;
}
pub fn word(a: std.mem.Allocator, out: *std.ArrayList(u8), value: u32) !void {
    var bytes: [4]u8 = undefined;
    std.mem.writeInt(u32, &bytes, value, .little);
    try append(a, out, &bytes);
}
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    if (out.items.len > max_output or bytes.len > max_output - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}

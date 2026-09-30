//! Canonical HWP5 record framing. Payload schemas remain with their modules.
const std = @import("std");
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u10, level: u10, payload: []const u8, limit: usize) !void {
    const extended = payload.len >= 4095;
    const header_len: usize = if (extended) 8 else 4;
    if (payload.len > std.math.maxInt(u32) or out.items.len > limit or header_len > limit - out.items.len or payload.len > limit - out.items.len - header_len) return error.LimitExceeded;
    var header: [8]u8 = undefined;
    const size: u32 = if (extended) 4095 else @intCast(payload.len);
    std.mem.writeInt(u32, header[0..4], @as(u32, tag) | (@as(u32, level) << 10) | (size << 20), .little);
    if (extended) std.mem.writeInt(u32, header[4..8], @intCast(payload.len), .little);
    try out.appendSlice(a, header[0..header_len]);
    try out.appendSlice(a, payload);
}

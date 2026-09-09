const std = @import("std");
const f = @import("test_fixture.zig");
pub const put = f.put;
pub fn make(a: std.mem.Allocator, kind: u32, data: []const u8, gap: usize, tail: usize) ![]u8 {
    const base = try f.extended(a, 124);
    defer a.free(base);
    const bytes = try a.alloc(u8, base.len + gap + data.len + tail);
    @memset(bytes, 0xa5);
    @memcpy(bytes[0..base.len], base);
    put(bytes, 2, u32, @intCast(bytes.len));
    put(bytes, 70, u32, kind);
    put(bytes, 126, u32, @intCast(base.len + gap - 14));
    put(bytes, 130, u32, @intCast(data.len));
    @memcpy(bytes[base.len + gap ..][0..data.len], data);
    return bytes;
}

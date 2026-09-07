const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const result = try core.zlib.decodePrefix(a, bytes, limit);
    defer a.free(result.bytes);
    const out = try a.alloc(u8, 4 + result.bytes.len);
    std.mem.writeInt(u32, out[0..4], @intCast(result.consumed), .little);
    @memcpy(out[4..], result.bytes);
    return out;
}

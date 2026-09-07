const std = @import("std");
const iso = @import("hwpjs").text.iso639;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 2) return error.InvalidProbeInput;
    const r = iso.inspect(bytes[0..2].*);
    const out = try a.alloc(u8, 32);
    errdefer a.free(out);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], switch (r.status) {
        .listed => 1,
        .known_deprecated => 2,
        .not_listed => 3,
        .invalid_syntax => 4,
    }, .little);
    if (r.preferred) |p| {
        if (p.len > 4) return error.InvalidProbeOutput;
        std.mem.writeInt(u32, out[4..8], @intCast(p.len), .little);
        @memcpy(out[8..][0..p.len], p);
    }
    if (r.deprecated_on) |d| {
        if (d.len > 12) return error.InvalidProbeOutput;
        std.mem.writeInt(u32, out[12..16], @intCast(d.len), .little);
        @memcpy(out[16..][0..d.len], d);
    }
    std.mem.writeInt(u32, out[28..32], @intFromBool(r.history_complete), .little);
    return out;
}

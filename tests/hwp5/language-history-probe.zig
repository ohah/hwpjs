const std = @import("std");
const history = @import("hwpjs").text.bcp47_alpha2_history;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 3 or bytes[0] > 1) return error.InvalidProbeInput;
    const r = history.inspect(if (bytes[0] == 0) .language else .region, bytes[1..3].*);
    const out = try a.alloc(u8, 32);
    errdefer a.free(out);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], @intFromBool(r.registered), .little);
    if (r.deprecated_on) |d| {
        if (d.len > 12) return error.InvalidProbeOutput;
        std.mem.writeInt(u32, out[4..8], @intCast(d.len), .little);
        @memcpy(out[8..][0..d.len], d);
    }
    if (r.preferred) |p| {
        if (p.len > 8) return error.InvalidProbeOutput;
        std.mem.writeInt(u32, out[20..24], @intCast(p.len), .little);
        @memcpy(out[24..][0..p.len], p);
    }
    return out;
}

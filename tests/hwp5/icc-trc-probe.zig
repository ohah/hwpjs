const std = @import("std");
const trc = @import("hwpjs").image.icc.trc_tag;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: trc.Edition) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.InvalidProbeInput;
    const value = try trc.parse(bytes[0..4].*, bytes[4..], edition);
    if (value) |v| {
        const payload = switch (v.curve) {
            .curve_type => try @import("icc-curve-probe.zig").run(a, bytes[4..], limit),
            .parametric => try @import("icc-parametric-probe.zig").run(a, bytes[4..], limit),
        };
        defer a.free(payload);
        const out = try a.alloc(u8, 16 + payload.len);
        const fields = [_]u32{ 1, @intFromEnum(v.channel), @intFromBool(v.semantics_deferred), @intFromEnum(v.curve) };
        for (fields, 0..) |field, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], field, .little);
        @memcpy(out[16..], payload);
        return out;
    }
    const out = try a.alloc(u8, 16);
    @memset(out, 0);
    return out;
}

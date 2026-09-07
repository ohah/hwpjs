const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 8) return error.InvalidProbeInput;
    const records = std.mem.readInt(u32, bytes[4..8], .big);
    const view = try icc.mluc.parse(bytes[8..], .{ .max_bytes = limit, .max_records = records });
    const r = try icc.mluc_unicode.inspect(a, view, .{ .max_unique_bytes = std.mem.readInt(u32, bytes[0..4], .big), .max_records = records });
    const out = try a.alloc(u8, 48);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], @intCast(r.records), .little);
    std.mem.writeInt(u32, out[4..8], @intCast(r.unique_strings), .little);
    std.mem.writeInt(u32, out[8..12], @intCast(r.inspected_bytes), .little);
    std.mem.writeInt(u32, out[12..16], @intCast(r.nul_terminated_records), .little);
    std.mem.writeInt(u64, out[16..24], r.scalars, .little);
    std.mem.writeInt(u64, out[24..32], r.nul_scalars, .little);
    std.mem.writeInt(u64, out[32..40], r.bom_scalars, .little);
    std.mem.writeInt(u32, out[40..44], @intFromBool(r.locale_deferred), .little);
    return out;
}

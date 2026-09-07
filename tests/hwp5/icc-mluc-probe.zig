const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: icc.trc_tag.Edition) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 8) return error.InvalidProbeInput;
    const value = try icc.localized_tag.parse(bytes[0..4].*, bytes[8..], edition, .{ .max_bytes = limit, .max_records = std.mem.readInt(u32, bytes[4..8], .big) });
    const count = if (value) |v| v.strings.count else 0;
    if (limit < 20 or count > (limit - 20) / 16) return error.LimitExceeded;
    const out = try a.alloc(u8, 20 + count * 16);
    @memset(out, 0);
    if (value) |v| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(u32, out[4..8], @intFromEnum(v.kind), .little);
        std.mem.writeInt(u32, out[8..12], @intCast(count), .little);
        std.mem.writeInt(u32, out[12..16], @intCast(v.strings.stride), .little);
        const flags: u32 = @as(u32, @intFromBool(v.unicode_deferred)) | (@as(u32, @intFromBool(v.locale_deferred)) << 1) | (@as(u32, @intFromBool(v.extensions_deferred)) << 2);
        std.mem.writeInt(u32, out[16..20], flags, .little);
        for (0..count) |i| {
            const r = try v.strings.at(i);
            const row = out[20 + i * 16 ..][0..16];
            @memcpy(row[0..2], &r.language);
            @memcpy(row[2..4], &r.country);
            std.mem.writeInt(u32, row[4..8], @intCast(r.text.len), .little);
            std.mem.writeInt(u32, row[8..12], @intCast(@intFromPtr(r.text.ptr) - @intFromPtr(v.strings.data.ptr)), .little);
            std.mem.writeInt(u32, row[12..16], @intCast(r.extension.len), .little);
        }
    }
    return out;
}

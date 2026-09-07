const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 12 or (bytes.len - 12) % 4 != 0) return error.InvalidProbeInput;
    if ((bytes[0] != 2 and bytes[0] != 4) or bytes[1] > 6 or bytes[2] > 3 or bytes[3] > 2) return error.InvalidProbeInput;
    const ctx: icc.required_plan.Context = .{
        .edition = if (bytes[0] == 2) .v2_2001 else .v4_2022,
        .profile_class = @enumFromInt(bytes[1]),
        .model = @enumFromInt(bytes[2]),
        .measurement_white = @enumFromInt(bytes[3]),
        .data_space = bytes[4..8].*,
        .pcs = bytes[8..12].*,
    };
    const r = try icc.required_presence.inspect(ctx, std.mem.bytesAsSlice([4]u8, bytes[12..]));
    const out = try a.alloc(u8, 8 + r.required.count() * 8);
    std.mem.writeInt(u32, out[0..4], @intCast(r.required.count()), .little);
    const flags: u32 = @as(u32, @intFromBool(r.adaptation_condition_deferred)) | (@as(u32, @intFromBool(r.payloads_deferred)) << 1) | (@as(u32, @intFromBool(r.computational_model_deferred)) << 2);
    std.mem.writeInt(u32, out[4..8], flags, .little);
    var iterator = r.required.iterator();
    var offset: usize = 8;
    while (iterator.next()) |name| {
        @memcpy(out[offset..][0..4], @tagName(name));
        std.mem.writeInt(u32, out[offset + 4 ..][0..4], @intFromBool(r.missing.contains(name)), .little);
        offset += 8;
    }
    return out;
}

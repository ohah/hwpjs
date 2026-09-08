const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4 or bytes[0] > 1 or (bytes[1] != 2 and bytes[1] != 4) or bytes[2] > 3 or bytes[3] > 2) return error.InvalidProbeInput;
    const selection: core.image.icc.required_table.Selection = .{ .edition = if (bytes[1] == 2) .v2_2001 else .v4_2022, .model = @enumFromInt(bytes[2]), .measurement_white = @enumFromInt(bytes[3]) };
    const r = try core.image.png_pixels.inspect(a, bytes[4..], .{ .structure = .{ .chunks = .{ .max_bytes = limit } }, .profile = .{ .layout = .bounded, .required = if (bytes[0] == 0) null else selection } });
    const required = if (r.profile) |p| p.required else null;
    const payload = if (required) |value| try @import("icc-required-output.zig").write(a, value) else try a.alloc(u8, 0);
    defer a.free(payload);
    const out = try a.alloc(u8, 16 + payload.len);
    std.mem.writeInt(u32, out[0..4], @intFromBool(r.profile != null), .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(required != null), .little);
    std.mem.writeInt(u32, out[8..12], if (r.profile) |p| @intFromBool(p.semantics_deferred) else 0, .little);
    std.mem.writeInt(u32, out[12..16], @intCast(r.structure.ancillary_chunks_deferred), .little);
    @memcpy(out[16..], payload);
    return out;
}

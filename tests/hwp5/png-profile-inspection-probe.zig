const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 12) return error.InvalidProbeInput;
    const r = try core.image.png_pixels.inspect(a, bytes[12..], .{
        .structure = .{ .chunks = .{ .max_bytes = limit } },
        .profile = .{
            .layout = .bounded,
            .max_tags = std.mem.readInt(u32, bytes[8..12], .big),
            .envelope = .{ .max_payload_bytes = std.mem.readInt(u32, bytes[0..4], .big), .max_profile_bytes = std.mem.readInt(u32, bytes[4..8], .big) },
        },
    });
    const fields = [_]u32{
        @intFromBool(r.profile != null),
        if (r.profile) |p| @intCast(p.profile_bytes) else 0,
        if (r.profile) |p| @intCast(p.tags) else 0,
        if (r.profile) |p| p.version_major else 0,
        if (r.profile) |p| std.mem.readInt(u32, &p.data_space, .big) else 0,
        if (r.profile) |p| @intFromBool(p.semantics_deferred) else 0,
        if (r.profile) |p| @intFromBool(p.storage.layout_validated) else 0,
        if (r.profile) |p| @intCast(p.storage.overlapping_elements) else 0,
        if (r.profile) |p| @intCast(p.storage.unreferenced_bytes) else 0,
        @intFromBool(r.color_semantics_deferred),
        @intCast(r.structure.ancillary_chunks_deferred),
        @intCast(r.structure.ancillary_bytes_deferred),
    };
    const out = try a.alloc(u8, fields.len * 4);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}

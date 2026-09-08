const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(a, bytes, limit, false);
}
pub fn runExtended(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(a, bytes, limit, true);
}
fn runFor(a: std.mem.Allocator, bytes: []const u8, limit: usize, extended: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 14 or bytes[0] > 1 or (bytes[1] != 2 and bytes[1] != 4)) return error.InvalidProbeInput;
    const options: core.image.icc.payload_inspection.Options = .{
        .edition = if (bytes[1] == 2) .v2_2001 else .v4_2022,
        .max_payload_bytes = std.mem.readInt(u32, bytes[2..6], .big),
        .max_localized_records = std.mem.readInt(u32, bytes[6..10], .big),
        .max_unicode_bytes = std.mem.readInt(u32, bytes[10..14], .big),
    };
    const r = try core.image.png_pixels.inspect(a, bytes[14..], .{ .structure = .{ .chunks = .{ .max_bytes = limit } }, .profile = .{ .layout = .bounded, .payloads = if (bytes[0] == 0) null else options } });
    const payload = if (r.profile) |p| p.payloads else null;
    const out = try a.alloc(u8, if (extended) 92 else 72);
    @memset(out, 0);
    const prefix = [_]usize{ @intFromBool(r.profile != null), @intFromBool(payload != null), @intFromBool(r.color_semantics_deferred), r.structure.ancillary_chunks_deferred };
    for (prefix, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    if (payload) |p| {
        const values = [_]usize{ p.tags, p.payload_bytes, p.xyz, p.trc, p.localized, p.adaptation, p.unhandled, p.unsupported_edition, p.xyz_context_deferred, p.luminance_unused_nonzero, p.localized_records, p.unicode_bytes, p.localized_extensions_deferred, @intFromBool(p.semantics_deferred) };
        for (values, 0..) |v, i| std.mem.writeInt(u32, out[16 + i * 4 ..][0..4], @intCast(v), .little);
        if (extended) {
            const v2 = [_]usize{ p.v2_description, p.v2_copyright, p.v2_unicode_bytes_deferred, p.v2_script_bytes_deferred, p.v2_trailing_bytes_deferred };
            for (v2, 0..) |v, i| std.mem.writeInt(u32, out[72 + i * 4 ..][0..4], @intCast(v), .little);
        }
    }
    return out;
}

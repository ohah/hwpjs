const std = @import("std");
const core = @import("hwpjs");
const Detail = enum { basic, v2, unicode };
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(a, bytes, limit, .basic);
}
pub fn runExtended(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(a, bytes, limit, .v2);
}
pub fn runUnicode(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(a, bytes, limit, .unicode);
}
fn runFor(a: std.mem.Allocator, bytes: []const u8, limit: usize, detail: Detail) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 14 or bytes[0] > 1 or (bytes[1] != 2 and bytes[1] != 4)) return error.InvalidProbeInput;
    const options: core.image.icc.payload_inspection.Options = .{
        .edition = if (bytes[1] == 2) .v2_2001 else .v4_2022,
        .max_payload_bytes = std.mem.readInt(u32, bytes[2..6], .big),
        .max_localized_records = std.mem.readInt(u32, bytes[6..10], .big),
        .max_unicode_bytes = std.mem.readInt(u32, bytes[10..14], .big),
        .v2_unicode_utf16be = detail == .unicode,
    };
    const r = try core.image.png_pixels.inspect(a, bytes[14..], .{ .structure = .{ .chunks = .{ .max_bytes = limit } }, .profile = .{ .layout = .bounded, .payloads = if (bytes[0] == 0) null else options } });
    const payload = if (r.profile) |p| p.payloads else null;
    const out = try a.alloc(u8, switch (detail) {
        .basic => 72,
        .v2 => 92,
        .unicode => 112,
    });
    @memset(out, 0);
    const prefix = [_]usize{ @intFromBool(r.profile != null), @intFromBool(payload != null), @intFromBool(r.color_semantics_deferred), r.structure.ancillary_chunks_deferred };
    for (prefix, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    if (payload) |p| {
        const values = [_]usize{ p.tags, p.payload_bytes, p.xyz, p.trc, p.localized, p.adaptation, p.unhandled, p.unsupported_edition, p.xyz_context_deferred, p.luminance_unused_nonzero, p.localized_records, p.unicode_bytes, p.localized_extensions_deferred, @intFromBool(p.semantics_deferred) };
        for (values, 0..) |v, i| std.mem.writeInt(u32, out[16 + i * 4 ..][0..4], @intCast(v), .little);
        if (detail != .basic) {
            const v2 = [_]usize{ p.v2_description, p.v2_copyright, p.v2_unicode_bytes_deferred, p.v2_script_bytes_deferred, p.v2_trailing_bytes_deferred };
            for (v2, 0..) |v, i| std.mem.writeInt(u32, out[72 + i * 4 ..][0..4], @intCast(v), .little);
        }
        if (detail == .unicode) {
            const unicode = [_]usize{ @intFromBool(p.v2_unicode_utf16be_selected), p.v2_unicode_descriptions_checked, p.v2_unicode_scalars, p.v2_unicode_nul_scalars, p.v2_unicode_bom_scalars };
            for (unicode, 0..) |v, i| std.mem.writeInt(u32, out[92 + i * 4 ..][0..4], @intCast(v), .little);
        }
    }
    return out;
}
